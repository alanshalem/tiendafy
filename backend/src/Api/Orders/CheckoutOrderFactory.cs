using Catalog.Contracts;
using Checkout.Core.Domain;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>La orden de un checkout y si nació en este pedido o ya existía (ver CheckoutOrderFactory).</summary>
public sealed record CheckoutOrder(Order Order, bool IsNew);

/// <summary>
/// La orden que nace de un checkout enviado, para cualquier medio de pago:
/// Checkout Pro, tarjeta en la tienda, Payway, transferencia o efectivo.
///
/// Una sesión de checkout produce como mucho UNA orden. Un doble clic, un
/// reintento del navegador o dos pestañas que piden pagar la misma compra
/// reciben la orden que ya estaba (<see cref="CheckoutOrder.IsNew"/> en false)
/// mientras siga pendiente, y un error claro si ya se pagó, se canceló o se
/// rechazó. Lo garantiza el índice único de <c>orders.checkout_session_id</c>,
/// también cuando los dos pedidos llegan en el mismo instante. Quien cobra con
/// una orden reusada no tiene que volver a cobrar lo que ya se cobró: Mercado
/// Pago lo frena con la clave de idempotencia (el id de la orden) y Payway con
/// el intento en curso (ver PaywayClient).
///
/// Vivía como un <c>internal static</c> de diez parámetros en OrderEndpoints, y
/// OfflinePaymentService lo llamaba desde ahí: un servicio dependiendo de la
/// capa HTTP. Acá las dependencias son las del servicio.
/// </summary>
public sealed class CheckoutOrderFactory(
    ICheckoutRepository checkouts,
    IOrderRepository orders,
    DiscountsDbContext discountsDb,
    CouponRedemptions couponRedemptions,
    CreateOrderHandler createOrder,
    ICatalogCheckoutQuery catalogQuery,
    IShippingMethodRepository shippingMethods)
{
    /// <summary>
    /// Crea la Order desde un checkout enviado, aplicando el cupón validado
    /// server-side. Con <paramref name="offline"/>, además el descuento y el
    /// plazo de la transferencia o el efectivo (ver Order.UseOfflinePayment).
    /// Si la sesión ya tiene su orden, devuelve esa (ver <see cref="Reuse"/>).
    /// </summary>
    public async Task<Result<CheckoutOrder>> CreateAsync(
        TenantId tenantId, Guid sessionId, string? couponCode, string? utmSource,
        CancellationToken ct, OfflinePaymentPlan? offline = null)
    {
        // Antes que el estado de la sesión: una sesión ya pagada puede figurar
        // completada o vencida, y lo que el comprador tiene que saber es que
        // la compra ya está pagada, no que "venció".
        if (await orders.GetByCheckoutSessionAsync(tenantId, sessionId, ct) is { } existing)
            return Reuse(existing, offline);

        var session = await checkouts.GetByIdAsync(tenantId, sessionId, ct);
        if (session is null) return Result.Failure<CheckoutOrder>(Error.NotFound("Checkout", sessionId));
        // Vencida (marcada o con el plazo cumplido): sus reservas ya volvieron o
        // están por volver al stock, así que no se cobra sobre ella. El
        // comprador arranca otra compra desde el carrito, que sigue intacto.
        if (session.IsExpired(DateTime.UtcNow))
            return Result.Failure<CheckoutOrder>(Error.Conflict("Checkout.Expired",
                "La compra venció: volvé a empezar desde el carrito."));
        if (session.Status != CheckoutStatus.Submitted)
            return Result.Failure<CheckoutOrder>(Error.Conflict("Checkout.NotSubmitted",
                "El checkout debe estar enviado (con stock reservado) antes de pagar."));

        // Cupón: NUNCA confiar en el descuento del cliente; recalcular server-side.
        Money discount = Money.Zero(session.Currency);
        var freeShipping = false;
        var code = (couponCode ?? string.Empty).Trim().ToUpperInvariant();
        // Si el uso del cupón se tomó en este pedido: si la venta no nace, vuelve.
        var tookCouponUse = false;
        if (code.Length > 0)
        {
            var subtotal = session.Items.Aggregate(0L, (s, i) => s + i.UnitPrice.AmountInMinorUnits * i.Quantity);
            var coupon = await discountsDb.Coupons.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value && c.Code == code, ct);
            if (coupon is not null)
            {
                // Un doble clic de esta misma compra no choca contra el uso que
                // ya tomó ella.
                var held = await couponRedemptions.IsHeldAsync(tenantId.Value, coupon.Id, session.Id, ct);
                var ev = coupon.Evaluate(subtotal, DateTime.UtcNow, useAlreadyTaken: held);
                // Agotado no se ignora como los demás rechazos: el comprador vio
                // el descuento en el carrito y pagaría sin él sin enterarse.
                if (ev.LimitReached) return CouponExhausted();
                if (ev.Valid)
                {
                    // El uso se toma ACÁ, con un UPDATE condicional: dos compras
                    // sobre el último uso no lo pueden tomar las dos (antes se
                    // contaba al pagar y un cupón de un uso servía para N).
                    if (!held)
                    {
                        var reservation = await couponRedemptions.ReserveAsync(tenantId.Value, coupon.Id, session.Id, ct);
                        if (reservation == CouponReservation.Exhausted) return CouponExhausted();
                        tookCouponUse = reservation == CouponReservation.Taken;
                    }
                    if (ev.Discount > 0) discount = new Money(ev.Discount, session.Currency);
                    freeShipping = ev.FreeShipping;
                }
            }
        }

        // Un cupón de envío gratis no descuenta del producto: pone el envío en
        // cero. Sin esto, el carrito prometía "envío gratis" y el comprador
        // igual pagaba el envío completo.
        var shippingCost = freeShipping ? Money.Zero(session.Currency) : session.ShippingCost;

        // Snapshot de COSTO al momento de la venta (rentabilidad): se lee del
        // catálogo acá y no en el checkout — el costo que importa es el vigente
        // cuando la orden nace. Best effort: sin costo cargado, la orden va igual.
        var variantCosts = (await catalogQuery.GetVariantsAsync(
                tenantId.Value, session.Items.Select(i => i.VariantId).Distinct().ToList(), ct))
            .Where(v => v.Cost is not null)
            .ToDictionary(v => v.VariantId, v => new Money(v.Cost!.Amount, v.Cost.Currency));

        var lines = session.Items.Select(i => new CreateOrderLine(
            i.VariantId, i.ProductName, i.VariantDescription, i.Sku, i.UnitPrice, i.Quantity, i.ReservationId,
            variantCosts.TryGetValue(i.VariantId, out var cost) ? cost : null)).ToList();

        // Retiro en el local: lo dice el medio que eligió (los de carrier, aunque sean
        // "a sucursal", se despachan y siguen con su seguimiento).
        var isPickup = session.ShippingMethodId is { } methodId
            && (await shippingMethods.GetByIdAsync(tenantId, methodId, ct))?.Kind == ShippingKind.Pickup;

        var buyerFullName = string.Join(' ', new[] { session.BuyerName, session.BuyerLastName }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        var placed = await createOrder.HandleAsync(new CreateOrderCommand(
            tenantId, session.Id, session.Email ?? string.Empty, session.Currency, lines,
            discount.IsZero ? null : discount, code.Length > 0 ? code : null,
            ShippingCost: shippingCost,
            ShippingMethodName: session.ShippingMethodName,
            ShippingAddress: session.ShippingAddress,
            BuyerName: buyerFullName.Length > 0 ? buyerFullName : null,
            BuyerPhone: session.Phone,
            DocNumber: session.DocNumber,
            Notes: session.Notes,
            UtmSource: utmSource,
            IsPickup: isPickup,
            OfflinePayment: offline), ct);
        // La venta no nació, o la que nació en el mismo instante (otro pedido
        // de la misma compra) no lleva este cupón: el uso tomado acá vuelve.
        if (tookCouponUse && (placed.IsFailure || (!placed.Value.IsNew && placed.Value.Order.CouponCode != code)))
            await couponRedemptions.ReleaseAsync(tenantId.Value, session.Id, ct);
        if (placed.IsFailure) return Result.Failure<CheckoutOrder>(placed.Error);

        // Otro pedido sobre la misma sesión la creó en el mismo instante.
        return placed.Value.IsNew
            ? new CheckoutOrder(placed.Value.Order, true)
            : Reuse(placed.Value.Order, offline);
    }

    private static Result<CheckoutOrder> CouponExhausted() =>
        Result.Failure<CheckoutOrder>(Error.Conflict("Checkout.CouponExhausted", Coupon.LimitReachedMessage));

    /// <summary>
    /// Qué hacer con la orden que ya tenía la sesión. Pendiente y con el mismo
    /// medio, se sigue con ella. Con otro medio no: el monto de una
    /// transferencia trae su descuento y el de una tarjeta no, así que no se
    /// cobra una con el otro (y para cambiar de medio, el checkout arranca una
    /// compra nueva). Pagada, cancelada o rechazada, un error que lo diga: el
    /// stock de una rechazada ya volvió a la venta, no se puede cobrar encima.
    /// </summary>
    private static Result<CheckoutOrder> Reuse(Order order, OfflinePaymentPlan? offline)
    {
        if (order.Status == OrderStatus.PendingPayment)
        {
            var sameMethod = offline is null
                ? !order.IsOfflinePayment
                : order.PaymentProvider == offline.Provider;
            return sameMethod
                ? new CheckoutOrder(order, false)
                : Result.Failure<CheckoutOrder>(Error.Conflict("Checkout.OtherMethod",
                    "Esta compra ya se está pagando con otro medio. Si querés cambiarlo, volvé a empezar desde el carrito."));
        }

        return Result.Failure<CheckoutOrder>(order.Status switch
        {
            OrderStatus.Cancelled => Error.Conflict("Checkout.OrderCancelled",
                "Esta compra se canceló. Volvé a empezar desde el carrito."),
            OrderStatus.Failed => Error.Conflict("Checkout.PaymentFailed",
                "El pago de esta compra no se aprobó. Volvé a empezar desde el carrito para intentar de nuevo."),
            _ => Error.Conflict("Checkout.AlreadyPaid",
                "Esta compra ya está pagada: no hace falta volver a pagarla."),
        });
    }
}
