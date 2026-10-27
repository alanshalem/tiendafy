using Discounts.Infrastructure;
using Orders.Core.Domain;
using Orders.Core.Features;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// El uso del cupón de una venta a lo largo de su vida: se toma al crearla
/// (<see cref="CheckoutOrderFactory"/>), vuelve si se cancela, vence o se
/// rechaza sin cobrarse, y al cobrarse queda contado una sola vez. Antes se
/// sumaba recién al pagar y sin concurrencia: un cupón de un solo uso lo
/// podían usar todas las compras armadas antes del primer pago.
///
/// Devolver es best-effort: la venta ya se canceló y eso no se deshace porque
/// falle el contador (queda en el log para corregirlo a mano).
/// </summary>
public sealed class OrderCouponUses(CouponRedemptions redemptions, ILogger<OrderCouponUses> logger)
{
    /// <summary>Devuelve el uso de una venta que terminó sin cobrarse.</summary>
    public async Task ReleaseAsync(Order order, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(order.CouponCode) || order.PaidAtUtc is not null) return;
        try
        {
            await redemptions.ReleaseAsync(order.TenantId.Value, order.CheckoutSessionId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "No se pudo devolver el uso del cupón {Coupon} de la venta {OrderId}.",
                order.CouponCode, order.Id);
        }
    }

    /// <summary>Si el pago la dejó rechazada, devuelve el uso (la venta no se cobró).</summary>
    public Task ReleaseIfFailedAsync(Result<SettleResult> settled, CancellationToken ct) =>
        settled.IsSuccess && settled.Value is { Outcome: SettleOutcome.Failed, Order: { } order }
            ? ReleaseAsync(order, ct)
            : Task.CompletedTask;

    /// <summary>La venta se cobró: su uso queda contado (sin sumar dos veces).</summary>
    public async Task CountPaidAsync(Order order, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(order.CouponCode)) return;
        await redemptions.CountPaidAsync(order.TenantId.Value, order.CouponCode, order.CheckoutSessionId, ct);
    }
}
