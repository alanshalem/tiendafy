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
    public Task ApplyAsync(Order order, CancellationToken ct) =>
        MoveAsync(order.TenantId.Value, LinesOf(order), reverse: false, $"Componentes de kit (venta {order.Label})", ct);

    /// <summary>
    /// Devolución: DEVUELVE los componentes al stock. Espejo exacto de la venta
    /// — sin esto, reingresar un kit dejaba sus piezas descontadas para siempre.
    /// </summary>
    public Task ReverseAsync(Order order, CancellationToken ct) =>
        MoveAsync(order.TenantId.Value, LinesOf(order), reverse: true, $"Componentes de kit (devolución {order.Label})", ct);

    /// <summary>
    /// Lo mismo para una venta que no es una Order de la tienda (Mercado
    /// Libre): <paramref name="lines"/> son las variantes vendidas y sus
    /// unidades; las que no son kit no tocan nada.
    /// </summary>
    public async Task MoveAsync(
        Guid tenantId, IReadOnlyCollection<(Guid VariantId, int Quantity)> lines, bool reverse, string reason,
        CancellationToken ct)
    {
        var variantIds = lines.Select(l => l.VariantId).Distinct().ToList();
        if (variantIds.Count == 0) return;
        var components = await catalog.KitComponents.IgnoreQueryFilters().AsNoTracking()
            .Where(k => k.TenantId == tenantId && variantIds.Contains(k.KitVariantId))
            .ToListAsync(ct);
        if (components.Count == 0) return;

        var qtyByKit = lines
            .GroupBy(l => l.VariantId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));

        var totals = components
            .GroupBy(c => c.ComponentVariantId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(c => c.Quantity * qtyByKit.GetValueOrDefault(c.KitVariantId)));

        var tenant = TenantId.From(tenantId);
        foreach (var (componentVariantId, total) in totals.Where(t => t.Value > 0))
        {
            try
            {
                await stock.AdjustAvailableAsync(tenant, componentVariantId, reverse ? total : -total, reason, ct);
            }
            catch (Exception ex)
            {
                // La venta ya está cobrada: el stock de un componente no puede
                // frenarla. Queda logueado para corregir a mano.
                logger.LogWarning(ex,
                    "Kit: no se pudo {Action} componente {VariantId} ({Reason}).",
                    reverse ? "reingresar" : "descontar", componentVariantId, reason);
            }
        }
    }

    private static List<(Guid VariantId, int Quantity)> LinesOf(Order order) =>
        [.. order.Items.Select(i => (i.VariantId, i.Quantity))];
}
