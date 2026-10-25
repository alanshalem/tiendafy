namespace MercadoLibre.Infrastructure;

/// <summary>De dónde salió la categoría de ML de un producto.</summary>
public enum MeliCategorySource
{
    /// <summary>La eligió una persona.</summary>
    Manual,

    /// <summary>Se tomó de una publicación existente en ML.</summary>
    Listing,

    /// <summary>La predijo el categorizador de ML a partir del título.</summary>
    Predicted,
}

/// <summary>
/// Categoría de Mercado Libre asignada a un producto del catálogo. Una por
/// producto: la usan la IA para armar la ficha y la publicación a ML.
/// </summary>
public sealed class MeliProductCategory
{
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }

    /// <summary>Id de la categoría en ML (ej: MLA1055).</summary>
    public string CategoryId { get; private set; } = string.Empty;

    /// <summary>Snapshot del nombre para mostrar sin ir a la API.</summary>
    public string CategoryName { get; private set; } = string.Empty;

    public MeliCategorySource Source { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private MeliProductCategory() { } // EF Core

    public static MeliProductCategory Create(
        Guid tenantId, Guid productId, string categoryId, string categoryName, MeliCategorySource source)
    {
        var category = new MeliProductCategory { TenantId = tenantId, ProductId = productId };
        category.Change(categoryId, categoryName, source);
        return category;
    }

    public void Change(string categoryId, string categoryName, MeliCategorySource source)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(categoryId);
        CategoryId = categoryId.Trim().ToUpperInvariant();
        CategoryName = (categoryName ?? string.Empty).Trim();
        Source = source;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
