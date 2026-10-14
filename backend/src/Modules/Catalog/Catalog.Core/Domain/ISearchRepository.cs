using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>Sinónimos de la tienda tal como se aplican, y si son los de fábrica.</summary>
public sealed record SynonymsInEffect(IReadOnlyList<IReadOnlyList<string>> Groups, bool IsDefault, DateTime? UpdatedAtUtc);

/// <summary>Un término buscado, con cuántas veces y cuántos productos encontró la última.</summary>
public sealed record SearchQueryRow(string Term, int Count, int LastResults, DateTime LastSearchedAtUtc);

/// <summary>
/// Lo que el buscador de la tienda guarda aparte del catálogo: los sinónimos
/// que cargó el comercio y lo que buscan los compradores.
/// </summary>
public interface ISearchRepository
{
    /// <summary>Los sinónimos que valen hoy: los guardados, o los de fábrica si nunca se guardó nada.</summary>
    Task<SynonymsInEffect> GetSynonymsAsync(TenantId tenantId, CancellationToken ct = default);

    /// <summary>Reemplaza la lista entera (vacía = sin sinónimos, no "volver a los de fábrica").</summary>
    Task<Result<SynonymsInEffect>> SaveSynonymsAsync(
        TenantId tenantId, IEnumerable<IEnumerable<string?>?>? groups, CancellationToken ct = default);

    /// <summary>Vuelve a los de fábrica (borra lo guardado).</summary>
    Task ResetSynonymsAsync(TenantId tenantId, CancellationToken ct = default);

    /// <summary>Suma una búsqueda del término (normalizado) con lo que encontró.</summary>
    Task RecordQueryAsync(TenantId tenantId, string term, int results, CancellationToken ct = default);

    /// <summary>
    /// Lo más buscado desde <paramref name="sinceUtc"/>. Con
    /// <paramref name="onlyWithResults"/>, solo lo que la última vez encontró
    /// algo (lo que se le puede sugerir a un comprador).
    /// </summary>
    Task<IReadOnlyList<SearchQueryRow>> TopQueriesAsync(
        TenantId tenantId, DateTime sinceUtc, int limit, bool onlyWithResults, bool onlyWithoutResults = false,
        CancellationToken ct = default);
}
