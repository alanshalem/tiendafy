using Api.Auth;
using Catalog.Core.Domain;
using Identity.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// El buscador de la tienda visto desde el panel (Configuración › Búsqueda):
/// los sinónimos que usa y lo que buscan los compradores. Y, del lado de la
/// tienda, el registro de cada búsqueda y las más populares.
/// </summary>
public static class SearchSettingsEndpoints
{
    /// <summary>Hasta cuándo atrás cuenta una búsqueda para "populares".</summary>
    private static readonly TimeSpan PopularWindow = TimeSpan.FromDays(60);

    /// <summary>Lo que se le sugiere a un comprador lo buscaron al menos esta cantidad de veces: una sola persona no alcanza.</summary>
    private const int PopularMinCount = 2;

    public static RouteGroupBuilder MapSearchSettingsEndpoints(this RouteGroupBuilder group)
    {
        var search = group.MapGroup("/search").RequireTenant();

        search.MapGet("/settings", async (ITenantContext tenant, ISearchRepository repository, CancellationToken ct) =>
            Results.Ok(SettingsDto(await repository.GetSynonymsAsync(tenant.TenantId, ct))))
            .RequirePermission(Permission.CatalogWrite);

        search.MapPut("/settings", async (
            SearchSettingsRequest request, ITenantContext tenant, ISearchRepository repository, CancellationToken ct) =>
        {
            var saved = await repository.SaveSynonymsAsync(tenant.TenantId, request.Synonyms, ct);
            return saved.IsSuccess ? Results.Ok(SettingsDto(saved.Value)) : saved.Error.ToProblem();
        }).RequirePermission(Permission.CatalogWrite);

        // Volver a los de fábrica: borra lo guardado.
        search.MapDelete("/settings", async (ITenantContext tenant, ISearchRepository repository, CancellationToken ct) =>
        {
            await repository.ResetSynonymsAsync(tenant.TenantId, ct);
            return Results.Ok(SettingsDto(await repository.GetSynonymsAsync(tenant.TenantId, ct)));
        }).RequirePermission(Permission.CatalogWrite);

        // Lo que buscan los compradores, con lo que no encuentra nada aparte:
        // eso es lo que pide un sinónimo (o un producto que falta).
        search.MapGet("/queries", async (
            ITenantContext tenant, ISearchRepository repository, CancellationToken ct, int days = 30, int limit = 50) =>
        {
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days, 1, 365));
            var top = await repository.TopQueriesAsync(tenant.TenantId, since, limit, onlyWithResults: false, ct: ct);
            var empty = await repository.TopQueriesAsync(tenant.TenantId, since, limit, onlyWithResults: false, onlyWithoutResults: true, ct: ct);
            return Results.Ok(new { top = top.Select(QueryDto), withoutResults = empty.Select(QueryDto) });
        }).RequireAnyPermission(Permission.CatalogWrite, Permission.StatsRead);

        // Tienda: una búsqueda hecha (la página de resultados, no cada tecla
        // del predictivo). Lo encontrado lo cuenta el servidor: el número no
        // viene del navegador, así que nadie puede colar un término "popular"
        // que no encuentre nada en el catálogo.
        search.MapPost("/log", async (
            SearchLogRequest request, ITenantContext tenant,
            IProductRepository products, ISearchRepository repository, CancellationToken ct) =>
        {
            var term = (request.Q ?? string.Empty).Trim();
            if (term.Length < ProductEndpoints.SuggestMinLength || term.Length > SearchQueryStat.MaxTermLength)
                return Results.NoContent();

            var results = await products.CountMatchingAsync(tenant.TenantId, term, ct);
            await repository.RecordQueryAsync(tenant.TenantId, term, results, ct);
            return Results.NoContent();
        });

        // Tienda: "Búsquedas populares" del buscador y de la página sin
        // resultados. Solo lo que encuentra algo y buscó más de una persona.
        search.MapGet("/popular", async (
            ITenantContext tenant, ISearchRepository repository, CancellationToken ct, int limit = 6) =>
        {
            var rows = await repository.TopQueriesAsync(tenant.TenantId, DateTime.UtcNow - PopularWindow,
                Math.Clamp(limit, 1, 12) * 2, onlyWithResults: true, ct: ct);
            return Results.Ok(new
            {
                items = rows.Where(r => r.Count >= PopularMinCount)
                    .Take(Math.Clamp(limit, 1, 12))
                    .Select(r => new { term = r.Term }),
            });
        });

        return group;
    }

    private static object SettingsDto(SynonymsInEffect synonyms) => new
    {
        synonyms = synonyms.Groups,
        isDefault = synonyms.IsDefault,
        updatedAt = synonyms.UpdatedAtUtc,
        defaults = SearchSynonyms.Defaults,
    };

    private static object QueryDto(SearchQueryRow row) => new
    {
        term = row.Term,
        count = row.Count,
        results = row.LastResults,
        lastSearchedAt = row.LastSearchedAtUtc,
    };
}

public sealed record SearchSettingsRequest(List<List<string?>?>? Synonyms);

public sealed record SearchLogRequest(string? Q);
