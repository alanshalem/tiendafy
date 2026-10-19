using Inventory.Contracts;
using Microsoft.Extensions.Logging;
using Orders.Core.Domain;

namespace Orders.Core.Features;

/// <summary>Un producto de una venta cobrada que no tenía stock para entregarse.</summary>
public sealed record StockShortage(Guid VariantId, string Product, int Missing);

/// <summary>
/// El stock de una venta que acaba de quedar pagada, por cualquier camino
/// (pasarela, transferencia registrada a mano, pago tardío sobre una venta que
/// figuraba rechazada o cancelada).
///
/// Por cada producto: si la reserva del checkout sigue activa, se confirma (la
/// mercadería sale). Si ya no (se pagó después de que venciera, o la venta se
/// había rechazado o cancelado y el stock volvió a la venta), se descuenta
/// directo de lo disponible. Si no alcanza, la venta igual queda pagada —la
/// plata ya entró— y lo que faltó vuelve como <see cref="StockShortage"/> para
/// que el comercio se entere. Lo que se vendió sin reserva es stock "sin
/// límite" (la reserva no se hace): no se descuenta.
/// </summary>
public static class PaidOrderStock
{
    public static async Task<IReadOnlyList<StockShortage>> SettleAsync(
        IInventoryService inventory, Order order, ILogger logger, CancellationToken ct)
    {
        var tenantId = order.TenantId.Value;
        var shortages = new List<StockShortage>();
        foreach (var item in order.Items)
        {
            if (item.ReservationId is not { } reservationId) continue;

            var confirm = await inventory.ConfirmReservationAsync(tenantId, reservationId, ct);
            if (confirm.IsSuccess) continue;

            // Vencida por la hora pero todavía sin liberar por el job: se libera
            // primero, así esas unidades vuelven a lo disponible y se descuentan
            // una sola vez. Si ya estaba liberada, no hay nada que devolver.
            await inventory.ReleaseReservationAsync(tenantId, reservationId, ct);

            var missing = await inventory.DeductSaleAsync(tenantId, item.VariantId, item.Quantity,
                $"Venta {order.Label} pagada sin reserva", ct);
            logger.LogWarning(
                "Reserva {ReservationId} de la orden {OrderId} no se pudo confirmar ({Error}); se descontó el stock directo (faltaron {Missing}).",
                reservationId, order.Id, confirm.Error.Code, missing);
            if (missing > 0)
                shortages.Add(new StockShortage(item.VariantId, ProductLabel(item), missing));
        }
        return shortages;
    }

    /// <summary>
    /// La nota para el comercio: qué falta y qué puede hacer. Sin jerga: es lo
    /// que lee quien atiende la tienda.
    /// </summary>
    public static string ShortageNote(IReadOnlyList<StockShortage> shortages)
    {
        var what = string.Join(", ", shortages.Select(s =>
            s.Missing == 1 ? $"{s.Product} (falta 1)" : $"{s.Product} (faltan {s.Missing})"));
        return $"Se pagó pero no había stock de {what}: reponelo o devolvé el pago.";
    }

    private static string ProductLabel(OrderItem item) =>
        string.IsNullOrWhiteSpace(item.VariantDescription) ? item.ProductName : $"{item.ProductName} · {item.VariantDescription}";
}
