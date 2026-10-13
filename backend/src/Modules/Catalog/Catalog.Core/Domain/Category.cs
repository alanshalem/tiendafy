using SharedKernel.Common;
using SharedKernel.Domain;

namespace Catalog.Core.Domain;

/// <summary>
/// Categoría de catálogo: árbol simple por parent_id + path materializado
/// ("ropa/remeras") para listar el árbol completo con un ORDER BY.
/// </summary>
public sealed class Category : AggregateRoot
{
    public const int MaxDepth = 3;

    public string Name { get; private set; } = null!;
    public Slug Slug { get; private set; } = null!;
    public Guid? ParentId { get; private set; }
    /// <summary>Slugs desde la raíz: "ropa/remeras". Profundidad = segmentos.</summary>
    public string Path { get; private set; } = null!;

    private Category() { } // EF Core

    private Category(Guid id, TenantId tenantId, string name, Slug slug, Guid? parentId, string path)
        : base(id, tenantId)
    {
        Name = name;
        Slug = slug;
        ParentId = parentId;
        Path = path;
    }

    public static Result<Category> Create(TenantId tenantId, string? name, Category? parent = null)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 50)
            return Result.Failure<Category>(Error.Validation(
                "Category.InvalidName", "El nombre tiene que tener entre 1 y 50 caracteres."));

        var slugResult = Slug.Create(trimmed);
        if (slugResult.IsFailure)
            return Result.Failure<Category>(slugResult.Error);

        if (parent is not null && parent.Depth >= MaxDepth)
            return Result.Failure<Category>(Error.Validation(
                "Category.TooDeep", $"Las categorías admiten hasta {MaxDepth} niveles."));

        var path = parent is null
            ? slugResult.Value.Value
            : $"{parent.Path}/{slugResult.Value.Value}";

        return new Category(Guid.NewGuid(), tenantId, trimmed, slugResult.Value, parent?.Id, path);
    }

    public int Depth => Path.Count(c => c == '/') + 1;

    public Result Rename(string? name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 50)
            return Result.Failure(Error.Validation(
                "Category.InvalidName", "El nombre tiene que tener entre 1 y 50 caracteres."));

        // Path estable: renombrar no rompe URLs de la tienda (slug no cambia).
        Name = trimmed;
        return Result.Success();
    }
}
