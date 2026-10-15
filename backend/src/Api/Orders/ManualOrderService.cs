using Api.Endpoints;
using Api.Pricing;
using Catalog.Contracts;
using Catalog.Core.Domain;
using Customers.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Payments.Contracts;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>Lo que devuelve una venta manual creada: la orden y, si se cobró con link, el link de pago.</summary>
public sealed record ManualOrderResult(Order Order, string? PaymentLink);

/// <summary>
/// Venta cargada desde el admin (mostrador, WhatsApp, teléfono). Reserva stock
/// de verdad y, según el método, nace pagada (efectivo/transferencia) o queda
/// pendiente con un link de Mercado Pago que después cobra el webhook.
///
/// Vivía entero adentro del endpoint, con un IServiceProvider para pedir
/// servicios a mano: 158 líneas de reglas de negocio imposibles de testear sin
/// levantar HTTP. Acá las dependencias son explícitas y el endpoint queda
/// siendo lo que tiene que ser — traducir request a llamada y resultado a HTTP.
/// </summary>
public sealed class ManualOrderService(
    ICatalogCheckoutQuery catalogQuery,
    IStockRepository stock,
    IOrderRepository orders,
    IMercadoPagoPaymentService mp,
    PaidOrderSideEffects paidEffects,
    Api.Finance.LedgerPoster ledger,
    PriceListService pricing,
    CustomersDbContext customers)
{
    /// <summary>
    /// Venta a cuenta corriente: la mercadería sale y el cliente queda debiendo.
    /// Es una venta cerrada —descuenta stock, factura, cuenta en las
    /// estadísticas— y lo único distinto es que la plata todavía no entró.
    /// </summary>
    public const string CurrentAccountMethod = OrderPayment.CurrentAccount;

    public async Task<Result<ManualOrderResult>> CreateAsync(
        TenantId tenantId, ManualOrderRequest request, string? linkBaseUrl, CancellationToken ct,
        string channel = Order.ChannelManual)
    {
        if (request.Items is not { Count: > 0 })
            return Result.Failure<ManualOrderResult>(Error.Validation("Order.Empty", "Agregá al menos un producto."));

        var variantIds = request.Items.Select(i => i.VariantId).Distinct().ToList();
        if (variantIds.Count != request.Items.Count)
            return Result.Failure<ManualOrderResult>(
                Error.Validation("Order.DuplicateItem", "Cada variante va una sola vez."));

        var variants = (await catalogQuery.GetVariantsAsync(tenantId.Value, variantIds, ct))
            .ToDictionary(v => v.VariantId);
        if (variants.Count != variantIds.Count)
            return Result.Failure<ManualOrderResult>(
                Error.Validation("Order.UnknownVariant", "Algún producto ya no existe."));

        if (request.Items.Any(i => i.Quantity <= 0))
            return Result.Failure<ManualOrderResult>(
                Error.Validation("Order.BadQuantity", "Las cantidades tienen que ser positivas."));

        var currency = variants.Values.First().Price.Currency;

        // El precio que le toca a ESTE cliente. Un mayorista con lista propia
        // paga la lista, no el precio del público: cargarle el precio de
        // vidriera y descontar a mano es exactamente el error que las listas
        // vienen a evitar.
        var priceListId = await CustomerPriceListAsync(tenantId, request.CustomerId, ct);
        var resolver = await pricing.LoadAsync(tenantId, ct);

        var reserveResult = await ReserveAllAsync(tenantId, request.Items, variants, ct);
        if (reserveResult.IsFailure) return Result.Failure<ManualOrderResult>(reserveResult.Error);
        var reserved = reserveResult.Value;

        var order = BuildOrder(tenantId, request, variants, reserved, currency, resolver, priceListId);
        if (order.IsFailure)
        {
            await ReleaseAllAsync(tenantId, reserved, ct);
            return Result.Failure<ManualOrderResult>(order.Error);
        }
        order.Value.SetChannel(channel);

        // Una venta a cuenta corriente necesita saber A QUIÉN se le fía. Sin
        // cliente sería una deuda sin deudor: mejor negarse que crear una venta
        // que después nadie sabe cobrar.
        if (request.PaymentMethod == CurrentAccountMethod && request.CustomerId is null)
        {
            await ReleaseAllAsync(tenantId, reserved, ct);
            return Result.Failure<ManualOrderResult>(Error.Validation(
                "Order.CustomerRequired", "Para vender en cuenta corriente elegí un cliente."));
        }

        return request.PaymentMethod == "link"
            ? await CreateWithPaymentLinkAsync(tenantId, order.Value, reserved, linkBaseUrl!, ct)
            : await CreateAlreadyPaidAsync(tenantId, order.Value, request.PaymentMethod, reserved, ct, request.CustomerId);
    }

    /// <summary>La lista asignada al cliente, si tiene una y sigue activa.</summary>
    private async Task<Guid?> CustomerPriceListAsync(TenantId tenantId, Guid? customerId, CancellationToken ct)
    {
        if (customerId is not { } id) return null;

        var assigned = await customers.Customers.AsNoTracking()
            .Where(c => c.Id == id && c.TenantId == tenantId.Value)
            .Select(c => c.PriceListId)
            .FirstOrDefaultAsync(ct);

        return await pricing.ActiveListForAsync(tenantId, assigned, ct);
    }

    /// <summary>
    /// Reservas REALES (anti-oversell). Si una línea no tiene stock se liberan
    /// las anteriores: la venta no se crea a medias.
    /// </summary>
    private async Task<Result<List<(Guid VariantId, Guid ReservationId)>>> ReserveAllAsync(
        TenantId tenantId, IReadOnlyList<ManualOrderItemRequest> items,
        Dictionary<Guid, CheckoutVariantDto> variants, CancellationToken ct)
    {
        var reserved = new List<(Guid VariantId, Guid ReservationId)>();
        foreach (var item in items)
        {
            var reservation = await stock.TryReserveAsync(tenantId, item.VariantId, item.Quantity, ct);
            if (reservation.IsFailure)
            {
                await ReleaseAllAsync(tenantId, reserved, ct);
                var name = variants[item.VariantId].ProductName;
                return Result.Failure<List<(Guid, Guid)>>(
                    Error.Conflict("Order.NoStock", $"Sin stock suficiente de {name}."));
            }
            reserved.Add((item.VariantId, reservation.Value.Id));
        }
        return reserved;
    }

    private async Task ReleaseAllAsync(
        TenantId tenantId, List<(Guid VariantId, Guid ReservationId)> reserved, CancellationToken ct)
    {
        foreach (var (_, rid) in reserved)
            await stock.ReleaseReservationAsync(tenantId, rid, ct);
    }

    private static Result<Order> BuildOrder(
        TenantId tenantId, ManualOrderRequest request, Dictionary<Guid, CheckoutVariantDto> variants,
        List<(Guid VariantId, Guid ReservationId)> reserved, string currency,
        PriceResolver resolver, Guid? priceListId)
    {
        var reservationByVariant = reserved.ToDictionary(r => r.VariantId, r => r.ReservationId);
        var lines = request.Items!.Select(i =>
        {
            var v = variants[i.VariantId];
            // Precio de la línea: el que puso el vendedor a mano, o el que le
            // corresponde al cliente según su lista (sin lista, el del producto).
            var unitPrice = i.UnitPriceMinor is { } price and > 0
                ? new Money(price, currency)
                : new Money(resolver.Resolve(priceListId, i.VariantId, v.Price.Amount), v.Price.Currency);
            var unitCost = v.Cost is { } c ? new Money(c.Amount, c.Currency) : (Money?)null;
            return (i.VariantId, v.ProductName, v.VariantDescription, v.Sku,
                unitPrice, i.Quantity, (Guid?)reservationByVariant[i.VariantId], unitCost);
        }).ToList();

        // Sin email del comprador va un placeholder: la orden necesita uno y
        // este dominio le avisa al resto del sistema que no hay a dónde escribir.
        var email = string.IsNullOrWhiteSpace(request.BuyerEmail)
            ? $"manual+{DateTime.UtcNow:yyyyMMddHHmmss}@sin-email.local"
            : request.BuyerEmail.Trim();
        var discount = request.DiscountMinor is { } d and > 0 ? new Money(d, currency) : (Money?)null;

        var created = Order.Create(tenantId, Guid.NewGuid(), email, currency, lines, discount);
        if (created.IsFailure) return created;
        var order = created.Value;

        var methodLabel = request.PaymentMethod switch
        {
            OrderPayment.Cash => "Efectivo",
            OrderPayment.Transfer => "Transferencia",
            CurrentAccountMethod => "Cuenta corriente",
            _ => "Link de Mercado Pago",
        };
        order.SetShippingAndBuyer(
            request.ShippingCostMinor is { } ship and > 0 ? new Money(ship, currency) : Money.Zero(currency),
            request.ShippingMethodName ?? "Entrega a coordinar",
            request.ShippingAddress,
            request.BuyerName,
            request.BuyerPhone,
            request.DocNumber,
            $"Venta manual ({methodLabel}){(string.IsNullOrWhiteSpace(request.Notes) ? "" : $" · {request.Notes!.Trim()}")}");
        return order;
    }

    /// <summary>Link de MP: la orden queda PENDIENTE y el webhook la cobra sola, con todos los side-effects.</summary>
    private async Task<Result<ManualOrderResult>> CreateWithPaymentLinkAsync(
        TenantId tenantId, Order order, List<(Guid VariantId, Guid ReservationId)> reserved,
        string baseUrl, CancellationToken ct)
    {
        await orders.AddAsync(order, ct);
        await orders.SaveChangesAsync(ct);

        var prefItems = order.Items
            .Select(i => new PreferenceItem(
                string.IsNullOrWhiteSpace(i.VariantDescription) ? i.ProductName : $"{i.ProductName} · {i.VariantDescription}",
                i.Quantity, i.UnitPrice.ToDecimal()))
            .ToList();
        var pref = await mp.CreateCheckoutProPreferenceAsync(new CreatePreferenceRequest(
            tenantId, order.Id, order.Currency, prefItems, order.BuyerEmail,
            SuccessUrl: $"{baseUrl}/checkout/success?order={order.Id}",
            FailureUrl: $"{baseUrl}/checkout/failure?order={order.Id}",
            PendingUrl: $"{baseUrl}/checkout/pending?order={order.Id}",
            DiscountAmount: order.DiscountAmount.ToDecimal()), ct);
        if (pref.IsFailure)
        {
            // Sin link no hay cobro: liberar las reservas y avisar.
            await ReleaseAllAsync(tenantId, reserved, ct);
            return Result.Failure<ManualOrderResult>(pref.Error);
        }

        order.AttachPreference(pref.Value.PreferenceId);
        await orders.SaveChangesAsync(ct);
        return new ManualOrderResult(order, pref.Value.InitPoint);
    }

    /// <summary>Efectivo o transferencia: la plata ya está, se marca pagada acá.</summary>
    private async Task<Result<ManualOrderResult>> CreateAlreadyPaidAsync(
        TenantId tenantId, Order order, string paymentMethod,
        List<(Guid VariantId, Guid ReservationId)> reserved, CancellationToken ct, Guid? customerId = null)
    {
        var paid = order.MarkPaid(OrderPayment.ManualPaymentId(paymentMethod));
        if (paid.IsFailure)
        {
            await ReleaseAllAsync(tenantId, reserved, ct);
            return Result.Failure<ManualOrderResult>(paid.Error);
        }

        await orders.AddAsync(order, ct);

        // Confirmar reservas: la mercadería sale (mismo cierre que un pago real).
        foreach (var (_, reservationId) in reserved)
            await stock.ConfirmReservationAsync(tenantId, reservationId, ct);

        await orders.SaveChangesAsync(ct);

        // Mismos efectos que un pago real, menos el WhatsApp (el comprador está
        // en el mostrador).
        await paidEffects.RunAsync(order, whatsApp: false, ct);

        // Si se fió, queda asentado en la cuenta corriente del cliente. Va
        // DESPUÉS de cerrar la venta: si esto fallara, la venta ya está hecha y
        // la deuda se puede cargar a mano; al revés dejaría stock descontado sin
        // venta.
        if (paymentMethod == CurrentAccountMethod && customerId is { } cid)
            await ledger.PostSaleAsync(
                tenantId.Value, cid, order.Id, $"Venta {order.Label}",
                order.Total.AmountInMinorUnits, order.Total.Currency, order.PaidAtUtc ?? DateTime.UtcNow, ct);

        return new ManualOrderResult(order, null);
    }
}
