using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;

namespace Api.Purchasing;

/// <summary>Conjuntos de estados que cuentan las métricas de la pantalla de compras.</summary>
public enum PurchaseOrderGroup { All, Open, InTransit, InvoiceMissing }

public sealed record PurchaseOrderFilter(PurchaseOrderStatus? Status, PurchaseOrderGroup Group, string? Q);

public sealed record PurchasingSummary(
    int Total, int Open, int InTransit, int Received, decimal CommittedFob, string Currency, int WithoutInvoice);

/// <summary>
/// Las consultas de órdenes de compra de <c>/purchasing/purchase-orders</c>,
/// <c>/purchasing/summary</c> y del asistente. Movidas tal cual desde el
/// endpoint; filtran por tienda explícita además del filtro global de EF.
/// </summary>
public sealed class PurchaseOrderQueries(PurchasingDbContext db)
{
    /// <summary>La tienda, el estado, el grupo y la búsqueda. Sin orden: lo pone quien llama.</summary>
    public IQueryable<PurchaseOrder> Filtered(Guid tenantId, PurchaseOrderFilter filter)
    {
        var query = db.PurchaseOrders.AsNoTracking().Where(p => p.TenantId == tenantId);
        if (filter.Status is { } st)
            query = query.Where(p => p.Status == st);

        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var term = $"%{filter.Q.Trim()}%";
            query = query.Where(p =>
                EF.Functions.ILike(p.SupplierName, term)
                || (p.Reference != null && EF.Functions.ILike(p.Reference, term)));
        }

        // Grupos de estados: lo que cuentan las métricas de la pantalla no
        // es un estado, es un conjunto ("abiertas" son cinco de los siete).
        // Se repiten acá en vez de usar IsOpen/HasSupplierInvoice porque esos
        // son propiedades calculadas y no se traducen a SQL.
        return filter.Group switch
        {
            PurchaseOrderGroup.Open => query.Where(p =>
                p.Status != PurchaseOrderStatus.Received && p.Status != PurchaseOrderStatus.Cancelled),
            PurchaseOrderGroup.InTransit => query.Where(p =>
                p.Status == PurchaseOrderStatus.InTransit || p.Status == PurchaseOrderStatus.InCustoms),
            PurchaseOrderGroup.InvoiceMissing => query.Where(p =>
                p.Status == PurchaseOrderStatus.Received
                && (p.InvoiceNumber == null || p.InvoiceDateUtc == null)),
            _ => query,
        };
    }

    /// <summary>Qué hay en camino y cuánta plata está comprometida.</summary>
    public async Task<PurchasingSummary> SummaryAsync(Guid tenantId, CancellationToken ct)
    {
        var orders = await db.PurchaseOrders.AsNoTracking().Where(p => p.TenantId == tenantId).ToListAsync(ct);
        var open = orders.Where(p => p.IsOpen).ToList();

        return new PurchasingSummary(
            orders.Count,
            open.Count,
            orders.Count(p => p.Status is PurchaseOrderStatus.InTransit or PurchaseOrderStatus.InCustoms),
            orders.Count(p => p.Status == PurchaseOrderStatus.Received),
            // Comprometido: el FOB de todo lo que todavía no llegó. En la
            // moneda de las OC abiertas (casi siempre USD).
            open.Sum(p => p.TotalFob),
            open.Count > 0 ? open[0].Currency : "USD",
            orders.Count(p => p.Status == PurchaseOrderStatus.Received && !p.HasSupplierInvoice));
    }

    /// <summary>"open" | "intransit" | "invoicemissing"; cualquier otra cosa, todas.</summary>
    public static PurchaseOrderGroup ParseGroup(string? group) => group?.Trim().ToLowerInvariant() switch
    {
        "open" => PurchaseOrderGroup.Open,
        "intransit" => PurchaseOrderGroup.InTransit,
        "invoicemissing" => PurchaseOrderGroup.InvoiceMissing,
        _ => PurchaseOrderGroup.All,
    };
}
