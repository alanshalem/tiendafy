namespace MercadoLibre.Infrastructure;

/// <summary>
/// Valor de un atributo de ficha de Mercado Libre (BRAND, MODEL, GTIN…) para
/// un producto. Puede ser un valor del catálogo de ML (ValueId) o texto libre
/// (ValueName); al menos uno de los dos es obligatorio.
/// </summary>
public sealed class MeliProductAttribute
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }

    /// <summary>Id del atributo en ML, siempre en mayúsculas (ej: BRAND).</summary>
    public string AttributeId { get; private set; } = string.Empty;

    public string? ValueId { get; private set; }
    public string? ValueName { get; private set; }

    /// <summary>Unidad para atributos numéricos con unidad (ej: cm, kg).</summary>
    public string? Unit { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private MeliProductAttribute() { } // EF Core

    public static MeliProductAttribute Create(
        Guid tenantId, Guid productId, string attributeId, string? valueId, string? valueName, string? unit)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(attributeId);
        if (string.IsNullOrWhiteSpace(valueId) && string.IsNullOrWhiteSpace(valueName))
            throw new ArgumentException("Hace falta valueId o valueName.", nameof(valueName));

        return new MeliProductAttribute
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ProductId = productId,
            AttributeId = attributeId.Trim().ToUpperInvariant(),
            ValueId = string.IsNullOrWhiteSpace(valueId) ? null : valueId.Trim(),
            ValueName = string.IsNullOrWhiteSpace(valueName) ? null : valueName.Trim(),
            Unit = string.IsNullOrWhiteSpace(unit) ? null : unit.Trim(),
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }
}
