using Catalog.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// Al PAGARSE una orden, descuenta el stock de los COMPONENTES de las
/// variantes-kit vendidas (BOM de kit_components). Best effort e idempotente
/// por diseño: solo corre en el outcome JustPaid, que ocurre una única vez.
/// El stock del kit en sí ya lo manejó la reserva del checkout.
/// </summary>
public sealed class KitStockService(
    CatalogDbContext catalog, IStockRepository stock, ILogger<KitStockService> logger)
{
    /// <summary>Venta: descuenta los componentes de las variantes-kit vendidas.</summary>
    public Task ApplyAsync(Order order, CancellationToken ct) => ApplyAsync(order, reverse: false, ct);

    /// <summary>
    /// Devolución: DEVUELVE los componentes al stock. Espejo exacto de la venta
    /// — sin esto, reingresar un kit dejaba sus piezas descontadas para siempre.
    /// </summary>
    public Task ReverseAsync(Order order, CancellationToken ct) => ApplyAsync(order, reverse: true, ct);

    private async Task ApplyAsync(Order order, bool reverse, CancellationToken ct)
    {
        var variantIds = order.Items.Select(i => i.VariantId).Distinct().ToList();
        var components = await catalog.KitComponents.IgnoreQueryFilters().AsNoTracking()
            .Where(k => k.TenantId == order.TenantId.Value && variantIds.Contains(k.KitVariantId))
            .ToListAsync(ct);
        if (components.Count == 0) return;

        var qtyByKit = order.Items
            .GroupBy(i => i.VariantId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

        var totals = components
            .GroupBy(c => c.ComponentVariantId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(c => c.Quantity * qtyByKit.GetValueOrDefault(c.KitVariantId)));

        var tenant = TenantId.From(order.TenantId.Value);
        foreach (var (componentVariantId, total) in totals.Where(t => t.Value > 0))
        {
            try
            {
                await stock.AdjustAvailableAsync(
                    tenant, componentVariantId, reverse ? total : -total,
                    reverse
                        ? $"Componentes de kit (devolución {order.Label})"
                        : $"Componentes de kit (venta {order.Label})", ct);
            }
            catch (Exception ex)
            {
                // La venta ya está cobrada: el stock de un componente no puede
                // frenarla. Queda logueado para corregir a mano.
                logger.LogWarning(ex,
                    "Kit: no se pudo {Action} componente {VariantId} de la orden {OrderId}.",
                    reverse ? "reingresar" : "descontar", componentVariantId, order.Id);
            }
        }
    }
}
