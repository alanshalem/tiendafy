using Catalog.Core.Domain;
using MercadoLibre.Infrastructure;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// Lo único de un producto que le llega al modelo: nombre, descripción, marca, SKU y códigos de barras, opciones de
/// variantes, ficha técnica, categorías de la tienda y los atributos de ML ya guardados. El record no tiene dónde poner
/// precios, costos, stock ni datos de personas, así que no hay forma de que se cuelen.
/// </summary>
/// <param name="MappedSpecAttributeIds">Ids de ML de las specs mapeadas con valor cuya definición aplica al producto.</param>
public sealed record AiCatalogProductData(
    Guid ProductId,
    string Name,
    string? Description,
    string? Brand,
    IReadOnlyList<string> Skus,
    IReadOnlyList<string> Barcodes,
    IReadOnlyList<string> VariantOptions,
    IReadOnlyList<(string Name, string Value)> Specs,
    IReadOnlyList<string> StoreCategories,
    IReadOnlyList<(string AttributeId, string Value)> SavedMeliAttributes,
    IReadOnlySet<string> MappedSpecAttributeIds)
{
    /// <summary>La descripción que se manda al modelo: una ficha larguísima no hace falta y encarece la corrida.</summary>
    public const int MaxDescriptionChars = 6_000;

    /// <summary>Todo lo anterior junto: lo que cuenta como "textual" para el gate (un identificador solo vale si está acá).</summary>
    public string SourceText => string.Join('\n',
        new[] { Name, Description, Brand }.Where(s => !string.IsNullOrWhiteSpace(s))
            .Concat(Skus)
            .Concat(Barcodes)
            .Concat(VariantOptions)
            .Concat(Specs.Select(s => $"{s.Name}: {s.Value}"))
            .Concat(StoreCategories)
            .Concat(SavedMeliAttributes.Select(a => a.Value)));

    public static AiCatalogProductData From(
        Product product, IReadOnlyList<SpecDefinition> definitions, IReadOnlyList<MeliProductAttribute> saved,
        IReadOnlyList<string> storeCategoryNames)
    {
        var byId = definitions.ToDictionary(d => d.Id);
        var specs = new List<(string Name, string Value)>();
        var mapped = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var spec in product.Specs)
        {
            if (!byId.TryGetValue(spec.DefinitionId, out var definition)) continue;
            var value = string.IsNullOrWhiteSpace(definition.Unit) ? spec.Value : $"{spec.Value} {definition.Unit}";
            specs.Add((definition.Name, value));

            // La definición aplica si vale para todo el catálogo o para alguna categoría del producto.
            var applies = definition.CategoryIds.Count == 0 || definition.CategoryIds.Any(product.CategoryIds.Contains);
            if (applies && !string.IsNullOrWhiteSpace(definition.MeliAttributeId)) mapped.Add(definition.MeliAttributeId);
        }

        return new AiCatalogProductData(
            product.Id,
            product.Name,
            Clip(product.Description),
            product.Brand,
            [.. product.Variants.Select(v => v.Sku)],
            [.. product.Variants.Select(v => v.Barcode).Where(b => !string.IsNullOrWhiteSpace(b))!],
            [.. product.Options.Select(o => $"{o.Name}: {string.Join(", ", o.Values)}")],
            specs,
            storeCategoryNames,
            [.. saved.Select(a => (a.AttributeId, Describe(a)))],
            mapped);
    }

    /// <summary>Ids de ML que ya tienen valor: specs mapeadas, atributos guardados y <c>BRAND</c> si el producto tiene marca. No se piden ni se pisan.</summary>
    public IReadOnlySet<string> FilledMeliAttributeIds()
    {
        var ids = new HashSet<string>(MappedSpecAttributeIds, StringComparer.OrdinalIgnoreCase);
        foreach (var (id, _) in SavedMeliAttributes) ids.Add(id);
        if (!string.IsNullOrWhiteSpace(Brand)) ids.Add("BRAND");
        return ids;
    }

    private static string? Clip(string? description) =>
        description is { Length: > MaxDescriptionChars } ? description[..MaxDescriptionChars] : description;

    private static string Describe(MeliProductAttribute a) =>
        string.IsNullOrWhiteSpace(a.Unit) ? a.ValueName ?? a.ValueId ?? "" : $"{a.ValueName} {a.Unit}";
}
