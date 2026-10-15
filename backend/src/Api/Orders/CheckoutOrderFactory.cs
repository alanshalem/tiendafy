using Catalog.Contracts;
using Checkout.Core.Domain;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// La orden que nace de un checkout enviado, para cualquier medio de pago:
/// Checkout Pro, tarjeta en la tienda, Payway, transferencia o efectivo.
///
/// Vivía como un <c>internal static</c> de diez parámetros en OrderEndpoints, y
/// OfflinePaymentService lo llamaba desde ahí: un servicio dependiendo de la
/// capa HTTP. Acá las dependencias son las del servicio.
/// </summary>
public sealed class CheckoutOrderFactory(
    ICheckoutRepository checkouts,
    DiscountsDbContext discountsDb,
    CreateOrderHandler createOrder,
    ICatalogCheckoutQuery catalogQuery,
    IShippingMethodRepository shippingMethods)
{
    /// <summary>
    /// Crea la Order desde un checkout enviado, aplicando el cupón validado
    /// server-side. Con <paramref name="offline"/>, además el descuento y el
    /// plazo de la transferencia o el efectivo (ver Order.UseOfflinePayment).
    /// </summary>
    public async Task<Result<Order>> CreateAsync(
        TenantId tenantId, Guid sessionId, string? couponCode, string? utmSource,
        CancellationToken ct, OfflinePaymentPlan? offline = null)
    {
        var session = await checkouts.GetByIdAsync(tenantId, sessionId, ct);
        if (session is null) return Result.Failure<Order>(Error.NotFound("Checkout", sessionId));
        if (session.Status != CheckoutStatus.Submitted)
            return Result.Failure<Order>(Error.Conflict("Checkout.NotSubmitted",
                "El checkout debe estar enviado (con stock reservado) antes de pagar."));

        // Cupón: NUNCA confiar en el descuento del cliente; recalcular server-side.
        Money discount = Money.Zero(session.Currency);
        var freeShipping = false;
        var code = (couponCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length > 0)
        {
            var subtotal = session.Items.Aggregate(0L, (s, i) => s + i.UnitPrice.AmountInMinorUnits * i.Quantity);
            var coupon = await discountsDb.Coupons.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value && c.Code == code, ct);
            if (coupon is not null)
            {
                var ev = coupon.Evaluate(subtotal, DateTime.UtcNow);
                if (ev.Valid)
                {
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

        return await createOrder.HandleAsync(new CreateOrderCommand(
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
    }
}
