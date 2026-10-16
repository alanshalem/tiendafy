using SharedKernel.Common;

namespace Catalog.Core.Domain;

public enum SpecType
{
    Text = 0,
    Number = 1,
    Boolean = 2,
    List = 3,
}

/// <summary>
/// Un campo de ficha técnica de esta tienda: "Diámetro del orificio", "Marca
/// compatible", "Código OEM".
///
/// Las definiciones son POR TIENDA porque cada una vende otra cosa: en un
/// gimnasio "paso de cadena" no significa nada, y en repuestos "diámetro del
/// orificio" tampoco. Y dentro de una tienda se acotan POR CATEGORÍA, así que
/// quien carga un disco ve tres campos y no cuarenta.
/// </summary>
public sealed class SpecDefinition
{
    public const int MaxOptions = 60;

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    /// <summary>
    /// Identificador estable. El nombre se puede corregir sin perder los
    /// valores ya cargados ni romper los links con filtros aplicados.
    /// </summary>
    public string Key { get; private set; } = string.Empty;

    public SpecType Type { get; private set; }

    /// <summary>Unidad de un número: "kg", "mm". Se muestra al lado del valor.</summary>
    public string? Unit { get; private set; }

    private readonly List<string> _options = [];
    /// <summary>Valores posibles cuando el tipo es lista.</summary>
    public IReadOnlyList<string> Options => _options.AsReadOnly();

    private readonly List<Guid> _categoryIds = [];
    /// <summary>Categorías donde aplica. Vacío = todo el catálogo.</summary>
    public IReadOnlyList<Guid> CategoryIds => _categoryIds.AsReadOnly();

    /// <summary>Se muestra en la ficha del producto en la tienda.</summary>
    public bool ShowOnProduct { get; private set; } = true;

    /// <summary>Se puede filtrar el catálogo por este campo.</summary>
    public bool Filterable { get; private set; }

    /// <summary>Atributo equivalente en Mercado Libre (ej: "BRAND", "MODEL").</summary>
    public string? MeliAttributeId { get; private set; }

    public int SortOrder { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private SpecDefinition() { } // EF Core

    public static Result<SpecDefinition> Create(TenantId tenantId, string? name, SpecType type, int sortOrder)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is < 2 or > 60)
            return Result.Failure<SpecDefinition>(Error.Validation(
                "Spec.Name", "El nombre del campo tiene entre 2 y 60 caracteres."));

        var key = Slug.Create(trimmed);
        if (key.IsFailure)
            return Result.Failure<SpecDefinition>(Error.Validation(
                "Spec.Name", "El nombre necesita al menos una letra o número."));

        return Result.Success(new SpecDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = trimmed,
            Key = key.Value.Value,
            Type = type,
            SortOrder = sortOrder,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public Result Update(
        string? name,
        SpecType type,
        string? unit,
        IEnumerable<string>? options,
        IEnumerable<Guid>? categoryIds,
        bool showOnProduct,
        bool filterable,
        string? meliAttributeId,
        int sortOrder)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is < 2 or > 60)
            return Result.Failure(Error.Validation("Spec.Name", "El nombre del campo tiene entre 2 y 60 caracteres."));

        Name = trimmed;
        Type = type;
        Unit = string.IsNullOrWhiteSpace(unit) ? null : unit.Trim()[..Math.Min(unit.Trim().Length, 12)];

        _options.Clear();
        if (type == SpecType.List && options is not null)
        {
            _options.AddRange(options
                .Select(o => o.Trim())
                .Where(o => o.Length is > 0 and <= 60)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxOptions));
        }

        _categoryIds.Clear();
        if (categoryIds is not null) _categoryIds.AddRange(categoryIds.Distinct());

        ShowOnProduct = showOnProduct;
        Filterable = filterable;
        // Los ids de atributo de Mercado Libre son mayúsculas y guiones bajos.
        var meli = (meliAttributeId ?? string.Empty).Trim().ToUpperInvariant();
        MeliAttributeId = meli.Length is > 0 and <= 40 && meli.All(c => char.IsAsciiLetterOrDigit(c) || c == '_')
            ? meli
            : null;
        SortOrder = sortOrder;
        return Result.Success();
    }
}
