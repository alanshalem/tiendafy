using Catalog.Core.Domain;
using MercadoLibre.Infrastructure;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>
/// El cuerpo del POST /items con el que se publica un producto del catálogo en
/// Mercado Libre. Función pura, aparte del endpoint, porque lleva plata
/// adentro: con la sincronización de precios prendida, el precio sale con el
/// mismo recargo del canal que después empuja <see cref="MeliStockSyncWorker"/>.
/// Antes se publicaba al precio de la tienda y la publicación nacía vendiendo
/// en ML sin el recargo hasta la siguiente pasada del worker.
/// </summary>
public static class MeliListingPayload
{
    /// <summary>
    /// El payload, el precio publicado (centavos, ya con el recargo) y la
    /// cantidad publicada (disponible − colchón): es lo que queda registrado
    /// como "último empujado" en el vínculo. Antes se registraba el disponible
    /// local entero y la primera pasada del worker mandaba un PUT de más.
    /// </summary>
    public sealed record Listing(Dictionary<string, object?> Payload, long PriceMinor, int Quantity);

    /// <summary>
    /// Lo que se publica en Mercado Libre de una variante con stock sin límite:
    /// ML exige una cantidad. Sin colchón (no hay nada que sobrevender), y
    /// después de cada venta de ML se vuelve a completar (ver MeliSyncService):
    /// la publicación nunca se pausa por falta de stock.
    /// </summary>
    public const int UnlimitedQuantity = 50;

    /// <summary>Cuánto publicar en ML: disponible − colchón, o la cantidad fija si es sin límite (null).</summary>
    public static int QuantityFor(int? sellable, MeliConnection connection) =>
        sellable is { } available ? available - connection.StockBufferUnits : UnlimitedQuantity;

    /// <param name="available">Disponible local de la variante (ya validado &gt; 0); null = sin límite.</param>
    /// <param name="specAttributeIds">Definición de ficha técnica → atributo de ML, solo las mapeadas.</param>
    /// <returns>
    /// Falla si el colchón anti-sobreventa se come todo el stock: publicar 1
    /// unidad igual (lo que se hacía antes) era justo la sobreventa que el
    /// colchón está para evitar.
    /// </returns>
    /// <param name="savedAttributes">
    /// Los atributos de ML guardados del producto (<c>MeliProductAttribute</c>), por ejemplo los que completó la IA al armar la ficha. Lo que la
    /// tienda ya tiene (la marca, el SKU y las specs mapeadas) manda sobre lo guardado.
    /// </param>
    public static Result<Listing> Build(
        Product product, Variant variant, MeliConnection connection,
        string categoryId, string? listingTypeId, int? available,
        IReadOnlyDictionary<Guid, string> specAttributeIds,
        IReadOnlyList<MeliProductAttribute>? savedAttributes = null)
    {
        // Mismo cálculo que MeliStockSyncWorker: en ML se publica stock − colchón.
        var quantity = QuantityFor(available, connection);
        if (quantity < 1)
            return Result.Failure<Listing>(Error.Validation("Meli.BufferExceedsStock",
                $"La variante tiene {available} disponibles y el colchón anti-sobreventa es de " +
                $"{connection.StockBufferUnits}: no queda stock para publicar en Mercado Libre. " +
                "Sumá stock o bajá el colchón en la configuración de Mercado Libre."));

        // Precio local en centavos → el del canal → ML espera decimal en la moneda del site.
        // El recargo es parte de la sincronización de precios (el panel lo muestra
        // solo con ella prendida): sin sincronización, un recargo guardado de
        // antes no se aplica a escondidas y se publica al precio de la tienda.
        var markup = connection.PriceSyncEnabled ? connection.PriceMarkupPct : 0m;
        var priceMinor = MeliPricing.ForChannel(variant.Price.AmountInMinorUnits, markup);
        var payload = new Dictionary<string, object?>
        {
            ["title"] = product.Name.Length > 60 ? product.Name[..60] : product.Name,
            ["category_id"] = categoryId,
            ["price"] = MeliPricing.ToApiAmount(priceMinor),
            ["currency_id"] = variant.Price.Currency,
            ["available_quantity"] = quantity,
            ["condition"] = "new",
            ["listing_type_id"] = string.IsNullOrWhiteSpace(listingTypeId) ? "gold_special" : listingTypeId,
            ["pictures"] = product.Images.OrderBy(i => i.Position).Take(6)
                .Select(i => new { source = i.Url }).ToArray(),
        };
        var attributes = Attributes(product, variant.Sku, specAttributeIds, savedAttributes);
        if (attributes.Count > 0) payload["attributes"] = attributes;
        return new Listing(payload, priceMinor, quantity);
    }

    /// <summary>
    /// Los atributos de la publicación, en este orden: <c>BRAND</c> (la marca), <c>SELLER_SKU</c> (si se pide), las specs
    /// mapeadas de la ficha técnica y, al final, los guardados cuyo id no esté ya (sin distinguir mayúsculas).
    /// </summary>
    /// <remarks>
    /// Ficha técnica: los campos que tienen equivalente declarado en Mercado Libre viajan como atributos. Una publicación con la ficha
    /// completa posiciona mejor y puede entrar al catálogo; hasta ahora mandábamos dos atributos de veinte.
    /// </remarks>
    /// <param name="sellerSku">Null para actualizar una publicación que ya existe: el SKU es de la variación y no se toca.</param>
    public static List<object> Attributes(
        Product product, string? sellerSku, IReadOnlyDictionary<Guid, string> specAttributeIds,
        IReadOnlyList<MeliProductAttribute>? savedAttributes)
    {
        var attributes = new List<object>();
        var sent = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string id, object attribute)
        {
            if (sent.Add(id)) attributes.Add(attribute);
        }

        if (!string.IsNullOrWhiteSpace(product.Brand))
            Add("BRAND", new { id = "BRAND", value_name = product.Brand });
        if (!string.IsNullOrWhiteSpace(sellerSku))
            Add("SELLER_SKU", new { id = "SELLER_SKU", value_name = sellerSku });

        foreach (var spec in product.Specs)
        {
            if (specAttributeIds.TryGetValue(spec.DefinitionId, out var meliId))
                attributes.Add(new { id = meliId, value_name = spec.Value });
            if (meliId is not null) sent.Add(meliId);
        }

        foreach (var saved in savedAttributes ?? [])
            Add(saved.AttributeId, AttributeJson(saved));
        return attributes;
    }

    /// <summary>
    /// Un atributo guardado como lo pide Mercado Libre: <c>{ id, value_id }</c> si es un valor de su lista (obligatorio en las listas y los
    /// sí/no) y, si no, <c>{ id, value_name }</c>; un número con unidad va como "30 cm", que es como lo devuelve ML.
    /// </summary>
    public static object AttributeJson(MeliProductAttribute saved)
    {
        if (!string.IsNullOrWhiteSpace(saved.ValueId))
            return new { id = saved.AttributeId, value_id = saved.ValueId };
        var name = string.IsNullOrWhiteSpace(saved.Unit) ? saved.ValueName : $"{saved.ValueName} {saved.Unit}";
        return new { id = saved.AttributeId, value_name = name };
    }
}
