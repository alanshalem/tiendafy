using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// La búsqueda y los filtros de las ventas de Mercado Libre del panel. Uno
/// solo para el listado y para los contadores (el Inicio cuenta "sin
/// facturar" con la misma regla con la que filtra la pestaña Ventas): si cada
/// uno la escribiera a mano, el número del aviso y lo que aparece al tocarlo
/// terminarían siendo distintos.
/// </summary>
public static class MeliOrderFilters
{
    public const string Unbilled = "sin-facturar";
    public const string Billed = "facturadas";
    public const string Paid = "pagadas";
    public const string AwaitingPayment = "pendientes";
    public const string Cancelled = "canceladas";

    /// <param name="notCounting">
    /// Comprobantes vinculados que no cuentan como factura (de otro ambiente,
    /// ver <see cref="MeliInvoices.NotCountingAsync"/>): la venta figura sin facturar.
    /// </param>
    public static IQueryable<MeliOrder> Apply(
        MeliDbContext db, string? search, string? estado, IReadOnlyCollection<Guid?> notCounting)
    {
        var text = search?.Trim().TrimStart('#').Trim();
        IQueryable<MeliOrder> query = db.Orders;
        if (!string.IsNullOrEmpty(text))
        {
            // Los productos viven en un jsonb: se busca sobre su texto, con SQL
            // porque EF no traduce ILIKE sobre una columna jsonb. El filtro de
            // tienda del contexto se sigue aplicando encima.
            var term = $"%{text}%";
            query = db.Orders.FromSqlInterpolated($"""
                SELECT * FROM meli_orders
                WHERE buyer_nickname ILIKE {term}
                   OR items_json::text ILIKE {term}
                   OR meli_order_id::text LIKE {term}
                   OR pack_id::text LIKE {term}
                """);
        }

        query = query.AsNoTracking();
        return estado switch
        {
            Unbilled => OnlyUnbilled(query, notCounting),
            Billed => query.Where(o => o.FiscalDocumentId != null && !notCounting.Contains(o.FiscalDocumentId)),
            Paid => query.Where(o => MeliOrder.EarningStatuses.Contains(o.Status)),
            AwaitingPayment => query.Where(o =>
                o.Status == "payment_required" || o.Status == "payment_in_process" || o.Status == "confirmed"),
            Cancelled => query.Where(o => o.Status == "cancelled"),
            _ => query,
        };
    }

    /// <summary>
    /// Cobradas, con importe y sin factura del ambiente actual: lo que el
    /// endpoint de facturación acepta facturar (ver <see cref="MeliOrder.IsPaid"/>).
    /// </summary>
    public static IQueryable<MeliOrder> OnlyUnbilled(IQueryable<MeliOrder> query, IReadOnlyCollection<Guid?> notCounting) =>
        query.Where(o => MeliOrder.EarningStatuses.Contains(o.Status)
            && (o.FiscalDocumentId == null || notCounting.Contains(o.FiscalDocumentId))
            && (o.PaidAmount > 0 || o.TotalAmount > 0));
}
