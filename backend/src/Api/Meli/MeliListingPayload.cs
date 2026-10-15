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

    /// <param name="available">Disponible local de la variante (ya validado &gt; 0).</param>
    /// <param name="specAttributeIds">Definición de ficha técnica → atributo de ML, solo las mapeadas.</param>
    /// <returns>
    /// Falla si el colchón anti-sobreventa se come todo el stock: publicar 1
    /// unidad igual (lo que se hacía antes) era justo la sobreventa que el
    /// colchón está para evitar.
    /// </returns>
    public static Result<Listing> Build(
        Product product, Variant variant, MeliConnection connection,
        string categoryId, string? listingTypeId, int available,
        IReadOnlyDictionary<Guid, string> specAttributeIds)
    {
        // Mismo cálculo que MeliStockSyncWorker: en ML se publica stock − colchón.
        var quantity = available - connection.StockBufferUnits;
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
        var attributes = new List<object>();
        if (!string.IsNullOrWhiteSpace(product.Brand))
            attributes.Add(new { id = "BRAND", value_name = product.Brand });
        if (!string.IsNullOrWhiteSpace(variant.Sku))
            attributes.Add(new { id = "SELLER_SKU", value_name = variant.Sku });

        // Ficha técnica: los campos que tienen equivalente declarado en
        // Mercado Libre viajan como atributos. Una publicación con la ficha
        // completa posiciona mejor y puede entrar al catálogo; hasta ahora
        // mandábamos dos atributos de veinte.
        foreach (var spec in product.Specs)
        {
            if (specAttributeIds.TryGetValue(spec.DefinitionId, out var meliId))
                attributes.Add(new { id = meliId, value_name = spec.Value });
        }

        if (attributes.Count > 0) payload["attributes"] = attributes;
        return new Listing(payload, priceMinor, quantity);
    }
}
