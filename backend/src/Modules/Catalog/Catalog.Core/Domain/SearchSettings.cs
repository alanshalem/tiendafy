using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Cómo busca la tienda: hoy, sus sinónimos. Una fila por tienda, y solo
/// cuando el comercio guardó algo: sin fila valen los de fábrica
/// (<see cref="SearchSynonyms.Defaults"/>). Con la fila, valen los suyos
/// aunque la lista quede vacía; borrarlos todos es una decisión, no un olvido.
/// </summary>
public sealed class SearchSettings
{
    public TenantId TenantId { get; private set; }

    // Cada grupo es un elemento de un text[], con los términos separados por
    // coma (por eso un término no puede tenerla). Un text[][] no lo mapea EF,
    // y una tabla por término sería una consulta más por cada búsqueda.
    private List<string> _synonymGroups = [];

    public IReadOnlyList<IReadOnlyList<string>> SynonymGroups =>
        [.. _synonymGroups.Select(g => (IReadOnlyList<string>)[.. g.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)])];

    public DateTime UpdatedAtUtc { get; private set; }

    private SearchSettings() { } // EF Core

    public SearchSettings(TenantId tenantId)
    {
        TenantId = tenantId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public Result SetSynonyms(IEnumerable<IEnumerable<string?>?>? groups)
    {
        var cleaned = SearchSynonyms.Clean(groups);
        if (cleaned.IsFailure) return Result.Failure(cleaned.Error);

        _synonymGroups = [.. cleaned.Value.Select(g => string.Join(", ", g))];
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }
}

/// <summary>
/// Lo que se buscó en la tienda, contado por término. Una fila por término y
/// no una por búsqueda: lo que se quiere saber es qué se busca más y qué no
/// encuentra nada (para cargarle un sinónimo), no quién buscó qué.
/// </summary>
public sealed class SearchQueryStat
{
    public const int MaxTermLength = 100;

    public TenantId TenantId { get; private set; }

    /// <summary>Normalizado (<see cref="SearchSynonyms.Normalize"/>): "Mancuerna" y "mancuerna " son lo mismo.</summary>
    public string Term { get; private set; } = string.Empty;

    public int Count { get; private set; }

    /// <summary>Cuántos productos encontró la última vez. Cero = algo que la tienda no sabe responder.</summary>
    public int LastResults { get; private set; }

    public DateTime LastSearchedAtUtc { get; private set; }

    private SearchQueryStat() { } // EF Core
}
