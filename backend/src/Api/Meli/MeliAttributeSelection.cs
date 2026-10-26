namespace Api.Meli;

/// <summary>
/// Qué atributos de una categoría se le piden al modelo: no los ~100 que tiene, solo los obligatorios y los que
/// mejoran la publicación, sin los que el producto ya tiene cargados. Los ocultos, de solo lectura o fijos ya
/// los saca <see cref="MeliCatalogReader.ParseAttributes"/>.
/// </summary>
public static class MeliAttributeSelection
{
    public const int MaxAsked = 40;

    /// <summary>Obligatorios primero y después por el orden de ML; corta en <see cref="MaxAsked"/>.</summary>
    public static IReadOnlyList<MeliCategoryAttribute> ToAsk(
        IReadOnlyList<MeliCategoryAttribute> category, IReadOnlySet<string> alreadyFilled)
    {
        var filled = new HashSet<string>(alreadyFilled, StringComparer.OrdinalIgnoreCase);
        return
        [
            .. category
                .Where(a => (a.Required || a.Relevant)
                    && !filled.Contains(a.Id)
                    // El SKU sale de la variante al publicar: nunca se le pide al modelo.
                    && !string.Equals(a.Id, "SELLER_SKU", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(a => a.Required)
                .Take(MaxAsked),
        ];
    }
}
