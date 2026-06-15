using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Variante vendible: SKU + combinación de valores de opción + precio.
/// El stock NO vive acá — es del módulo Inventory, indexado por VariantId.
/// </summary>
public sealed class Variant
{
    public Guid Id { get; private set; }
    public string Sku { get; private set; } = null!;

    private readonly List<string> _optionValues = [];
    /// <summary>Un valor por opción del producto, en el mismo orden: ["M", "Rojo"].</summary>
    public IReadOnlyList<string> OptionValues => _optionValues.AsReadOnly();

    public Money Price { get; private set; }
    public Money? CompareAtPrice { get; private set; }

    private Variant() { } // EF Core

    internal Variant(string sku, IEnumerable<string> optionValues, Money price, Money? compareAtPrice)
    {
        Id = Guid.NewGuid();
        Sku = sku;
        _optionValues.AddRange(optionValues);
        Price = price;
        CompareAtPrice = compareAtPrice;
    }

    internal void ChangePrice(Money price, Money? compareAtPrice)
    {
        Price = price;
        CompareAtPrice = compareAtPrice;
    }

    public bool Matches(IReadOnlyList<string> optionValues) =>
        _optionValues.SequenceEqual(optionValues, StringComparer.OrdinalIgnoreCase);
}
