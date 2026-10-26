using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Crm;

/// <summary>Cuántos clientes hay y cómo se reparten, sin un solo dato personal.</summary>
public sealed record CustomerSummary(
    int Total, int NewInPeriod, int NewPrevious, int WithPurchases, int Repeat,
    int NeverBought, int Inactive90, long AverageSpentMinor);

/// <summary>
/// Los agregados de la agenda para el asistente. Cuenta en la base desde el
/// resumen de compras de cada ficha (<c>OrdersCount</c>, <c>TotalSpentMinor</c>,
/// <c>LastOrderAtUtc</c>, <c>CreatedAtUtc</c>) y filtra por tienda explícita
/// además del filtro global de EF. No lee nombres, mails ni teléfonos.
/// </summary>
public sealed class CustomerSummaryQuery(CustomersDbContext db)
{
    /// <param name="sinceUtc">Inicio del período (inclusive).</param>
    /// <param name="untilUtc">Fin del período (exclusivo). El período anterior dura lo mismo y termina en <paramref name="sinceUtc"/>.</param>
    /// <param name="nowUtc">Ahora: de acá se cuentan los 90 días de inactividad.</param>
    public async Task<CustomerSummary> RunAsync(
        Guid tenantId, DateTime sinceUtc, DateTime untilUtc, DateTime nowUtc, CancellationToken ct)
    {
        var all = db.Customers.AsNoTracking().Where(c => c.TenantId == tenantId);
        var previousSince = sinceUtc - (untilUtc - sinceUtc);

        var total = await all.CountAsync(ct);
        var newInPeriod = await all.CountAsync(c => c.CreatedAtUtc >= sinceUtc && c.CreatedAtUtc < untilUtc, ct);
        var newPrevious = await all.CountAsync(c => c.CreatedAtUtc >= previousSince && c.CreatedAtUtc < sinceUtc, ct);

        var buyers = all.Where(c => c.OrdersCount > 0);
        var withPurchases = await buyers.CountAsync(ct);
        var repeat = await CustomerSegments.MinOrders(all, 2).CountAsync(ct);
        var neverBought = await CustomerSegments.NeverBought(all).CountAsync(ct);
        var inactive90 = await CustomerSegments.InactiveSince(all, nowUtc.AddDays(-90)).CountAsync(ct);

        var spent = withPurchases == 0 ? 0 : await buyers.SumAsync(c => c.TotalSpentMinor, ct);
        var average = withPurchases == 0 ? 0 : spent / withPurchases;

        return new CustomerSummary(total, newInPeriod, newPrevious, withPurchases, repeat, neverBought, inactive90, average);
    }
}
