namespace Catalog.Core.Domain;

/// <summary>
/// El valor que un producto tiene para un campo de ficha técnica. Se guarda
/// siempre como texto: quien lo lee sabe de qué tipo es por la definición, y
/// así un cambio de tipo no obliga a migrar datos.
/// </summary>
public sealed class ProductSpec
{
    public const int MaxValueLength = 120;

    public Guid Id { get; private set; }
    public Guid DefinitionId { get; private set; }
    public string Value { get; private set; } = string.Empty;

    private ProductSpec() { } // EF Core

    internal static ProductSpec? Create(Guid definitionId, string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        // Vacío no se guarda: un campo sin completar no es un dato, y guardarlo
        // llenaría la ficha del producto de renglones en blanco.
        if (trimmed.Length == 0) return null;

        return new ProductSpec
        {
            Id = Guid.NewGuid(),
            DefinitionId = definitionId,
            Value = trimmed.Length > MaxValueLength ? trimmed[..MaxValueLength] : trimmed,
        };
    }
}
