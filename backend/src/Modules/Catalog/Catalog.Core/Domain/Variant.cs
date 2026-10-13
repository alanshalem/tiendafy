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

    /// <summary>
    /// Costo unitario del merchant (misma moneda que el precio). Dato INTERNO:
    /// jamás sale por los DTOs públicos del catálogo — solo endpoints admin con
    /// permiso. Null = sin cargar (la rentabilidad lo excluye con aviso).
    /// </summary>
    public Money? Cost { get; private set; }

    /// <summary>Código de barras (EAN/UPC del proveedor o propio). El escáner busca por esto o por SKU.</summary>
    public string? Barcode { get; private set; }

    /// <summary>
    /// Peso de UNA unidad lista para despachar, en gramos. Null = sin cargar:
    /// los correos cotizan con el peso por defecto de su configuración.
    /// </summary>
    public int? WeightGrams { get; private set; }

    /// <summary>Medidas del paquete de una unidad, en cm. Las tres o ninguna.</summary>
    public int? LengthCm { get; private set; }
    public int? WidthCm { get; private set; }
    public int? HeightCm { get; private set; }

    private Variant() { } // EF Core

    internal Variant(string sku, IEnumerable<string> optionValues, Money price, Money? compareAtPrice, Money? cost = null)
    {
        Id = Guid.NewGuid();
        Sku = sku;
        _optionValues.AddRange(optionValues);
        Price = price;
        CompareAtPrice = compareAtPrice;
        Cost = cost;
    }

    internal void ChangePrice(Money price, Money? compareAtPrice)
    {
        Price = price;
        CompareAtPrice = compareAtPrice;
    }

    internal void SetCost(Money? cost) => Cost = cost;

    internal void SetBarcode(string? barcode) => Barcode = barcode;

    internal void SetShipping(int? weightGrams, int? lengthCm, int? widthCm, int? heightCm)
    {
        WeightGrams = weightGrams;
        LengthCm = lengthCm;
        WidthCm = widthCm;
        HeightCm = heightCm;
    }

    public bool Matches(IReadOnlyList<string> optionValues) =>
        _optionValues.SequenceEqual(optionValues, StringComparer.OrdinalIgnoreCase);
}
