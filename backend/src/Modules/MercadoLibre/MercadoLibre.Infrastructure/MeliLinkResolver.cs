namespace MercadoLibre.Infrastructure;

/// <summary>
/// Resuelve "ítem vendido en ML" → variante local. La regla tiene un fallback
/// que es fácil de olvidar (y se olvidó): una publicación CON variaciones puede
/// estar vinculada a nivel ítem (MeliVariationId null), y esa venta igual
/// corresponde a la variante vinculada. Estaba copiada en 3 lugares —
/// descuento de stock, demanda de reposición y rentabilidad del canal — y la
/// tercera copia no tenía el fallback: el margen de ML salía inflado justo
/// para esas publicaciones.
/// </summary>
public sealed class MeliLinkResolver
{
    private readonly Dictionary<(string ItemId, long? VariationId), Guid> _exact;
    private readonly Dictionary<string, Guid> _byItem;

    private MeliLinkResolver(
        Dictionary<(string, long?), Guid> exact, Dictionary<string, Guid> byItem)
    {
        _exact = exact;
        _byItem = byItem;
    }

    public static MeliLinkResolver From(IEnumerable<MeliItemLink> links)
    {
        var all = links.ToList();
        return new MeliLinkResolver(
            all.GroupBy(l => (l.MeliItemId, l.MeliVariationId))
                .ToDictionary(g => g.Key, g => g.First().VariantId),
            all.Where(l => l.MeliVariationId is null)
                .GroupBy(l => l.MeliItemId)
                .ToDictionary(g => g.Key, g => g.First().VariantId));
    }

    /// <summary>
    /// Vínculo exacto (item + variación) o, si no hay, el del ítem completo.
    ///
    /// Tolera que no venga el id de la publicación: el snapshot de la venta se
    /// arma con lo que manda Mercado Libre y un campo faltante llegaba como
    /// null hasta el diccionario, que tira ArgumentNullException. Una venta sin
    /// ese dato es una venta que no se puede atribuir, no un motivo para tumbar
    /// las estadísticas enteras.
    /// </summary>
    public bool TryResolve(string? itemId, long? variationId, out Guid variantId)
    {
        variantId = default;
        if (string.IsNullOrWhiteSpace(itemId)) return false;

        return _exact.TryGetValue((itemId, variationId), out variantId)
            || _byItem.TryGetValue(itemId, out variantId);
    }
}
