namespace MercadoLibre.Infrastructure;

/// <summary>
/// El vínculo de una publicación con el catálogo como lo ve el panel en el
/// listado de publicaciones. Uno solo para la cuenta real y la de ejemplo: el
/// panel lee los mismos campos de las dos.
/// </summary>
public sealed record MeliItemLinkDto(
    Guid ProductId, Guid VariantId, long? MeliVariationId,
    bool SyncStock, int? LastPushedQty, bool SyncPrice, decimal? LastPushedPrice)
{
    public static MeliItemLinkDto From(MeliItemLink link) => new(
        link.ProductId, link.VariantId, link.MeliVariationId,
        link.SyncStock, link.LastPushedQty, link.SyncPrice,
        link.LastPushedPriceMinor is { } m ? MeliPricing.ToApiAmount(m) : null);
}
