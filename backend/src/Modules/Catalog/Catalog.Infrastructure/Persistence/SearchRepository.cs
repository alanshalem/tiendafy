using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class SearchRepository(CatalogDbContext context) : ISearchRepository
{
    public Task<SynonymsInEffect> GetSynonymsAsync(TenantId tenantId, CancellationToken ct = default) =>
        LoadSynonymsAsync(context, tenantId, ct);

    /// <summary>
    /// Los sinónimos que valen para la tienda. Es una lectura por clave
    /// primaria por cada búsqueda; la comparte el buscador del catálogo, que
    /// vive en el mismo contexto.
    /// </summary>
    internal static async Task<SynonymsInEffect> LoadSynonymsAsync(
        CatalogDbContext context, TenantId tenantId, CancellationToken ct)
    {
        var saved = await context.SearchSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        return saved is null
            ? new SynonymsInEffect(SearchSynonyms.Defaults, IsDefault: true, UpdatedAtUtc: null)
            : new SynonymsInEffect(saved.SynonymGroups, IsDefault: false, saved.UpdatedAtUtc);
    }

    public async Task<Result<SynonymsInEffect>> SaveSynonymsAsync(
        TenantId tenantId, IEnumerable<IEnumerable<string?>?>? groups, CancellationToken ct = default)
    {
        var settings = await context.SearchSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new SearchSettings(tenantId);
            context.SearchSettings.Add(settings);
        }

        var result = settings.SetSynonyms(groups);
        if (result.IsFailure) return Result.Failure<SynonymsInEffect>(result.Error);

        await context.SaveChangesAsync(ct);
        return new SynonymsInEffect(settings.SynonymGroups, IsDefault: false, settings.UpdatedAtUtc);
    }

    public Task ResetSynonymsAsync(TenantId tenantId, CancellationToken ct = default) =>
        context.SearchSettings.Where(s => s.TenantId == tenantId).ExecuteDeleteAsync(ct);

    public async Task RecordQueryAsync(TenantId tenantId, string term, int results, CancellationToken ct = default)
    {
        var normalized = SearchSynonyms.Normalize(term);
        if (normalized.Length == 0 || normalized.Length > SearchQueryStat.MaxTermLength) return;

        // Un upsert: dos compradores buscando lo mismo a la vez no pueden
        // chocar contra la clave ni perder una cuenta.
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO search_queries (tenant_id, term, count, last_results, last_searched_at_utc)
            VALUES ({tenantId.Value}, {normalized}, 1, {Math.Max(0, results)}, {DateTime.UtcNow})
            ON CONFLICT (tenant_id, term) DO UPDATE SET
                count = search_queries.count + 1,
                last_results = EXCLUDED.last_results,
                last_searched_at_utc = EXCLUDED.last_searched_at_utc
            """, ct);
    }

    public async Task<IReadOnlyList<SearchQueryRow>> TopQueriesAsync(
        TenantId tenantId, DateTime sinceUtc, int limit, bool onlyWithResults, bool onlyWithoutResults = false,
        CancellationToken ct = default)
    {
        var query = context.SearchQueries.AsNoTracking()
            .Where(q => q.TenantId == tenantId && q.LastSearchedAtUtc >= sinceUtc);
        if (onlyWithResults) query = query.Where(q => q.LastResults > 0);
        if (onlyWithoutResults) query = query.Where(q => q.LastResults == 0);

        return await query
            .OrderByDescending(q => q.Count).ThenByDescending(q => q.LastSearchedAtUtc)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(q => new SearchQueryRow(q.Term, q.Count, q.LastResults, q.LastSearchedAtUtc))
            .ToListAsync(ct);
    }
}
