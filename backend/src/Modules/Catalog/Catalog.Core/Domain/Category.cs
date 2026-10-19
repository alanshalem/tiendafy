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
    /// <summary>
    /// Lugar entre sus hermanas (mismo padre), de menor a mayor: el orden que
    /// el comercio arma en el panel y que siguen los menús de la tienda. Con
    /// empate (las de antes de que existiera, todas en 0), por path.
    /// </summary>
    public int Position { get; private set; }

    private Category() { } // EF Core

    private Category(Guid id, TenantId tenantId, string name, Slug slug, Guid? parentId, string path, int position)
        : base(id, tenantId)
    {
        Name = name;
        Slug = slug;
        ParentId = parentId;
        Path = path;
        Position = position;
    }

    /// <param name="position">Su lugar entre las hermanas; una nueva va al final (ver ICategoryRepository.NextPositionAsync).</param>
    public static Result<Category> Create(TenantId tenantId, string? name, Category? parent = null, int position = 0)
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

        return new Category(Guid.NewGuid(), tenantId, trimmed, slugResult.Value, parent?.Id, path, position);
    }

    public int Depth => Path.Count(c => c == '/') + 1;

    public void MoveTo(int position) => Position = position;

    /// <summary>
    /// Ordena un árbol plano para mostrarlo: cada padre seguido de sus hijas,
    /// las hermanas por <see cref="Position"/> y, con empate, por path. Así la
    /// lista sigue teniendo los padres antes que los hijos.
    /// </summary>
    public static List<Category> InTreeOrder(IEnumerable<Category> categories)
    {
        var all = categories.ToList();
        var ids = all.Select(c => c.Id).ToHashSet();
        var byParent = all
            .GroupBy(c => c.ParentId is { } p && ids.Contains(p) ? p : (Guid?)null)
            .ToDictionary(
                g => g.Key ?? Guid.Empty,
                g => g.OrderBy(c => c.Position).ThenBy(c => c.Path, StringComparer.Ordinal).ToList());

        var result = new List<Category>(all.Count);
        void Visit(Guid parent)
        {
            if (!byParent.TryGetValue(parent, out var children)) return;
            foreach (var child in children)
            {
                result.Add(child);
                Visit(child.Id);
            }
        }
        Visit(Guid.Empty);
        return result;
    }

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
