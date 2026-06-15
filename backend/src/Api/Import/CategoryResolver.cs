using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Import;

/// <summary>
/// Resuelve (o crea) categorías a partir de los paths display del CSV
/// ("Indumentaria > Remeras, Ofertas"). Cachea el árbol del tenant en memoria
/// para toda la corrida; crea las que falten respetando la jerarquía y el
/// tope de profundidad. Devuelve los ids de las categorías hoja.
/// </summary>
public sealed class CategoryResolver
{
    private readonly ICategoryRepository _repository;
    private readonly CatalogDbContext _db;
    private readonly TenantId _tenant;
    private readonly Dictionary<string, Category> _byPath;

    private CategoryResolver(
        ICategoryRepository repository, CatalogDbContext db, TenantId tenant, IEnumerable<Category> existing)
    {
        _repository = repository;
        _db = db;
        _tenant = tenant;
        _byPath = existing.ToDictionary(c => c.Path, c => c);
    }

    public static async Task<CategoryResolver> CreateAsync(
        ICategoryRepository repository, CatalogDbContext db, TenantId tenant, CancellationToken ct)
    {
        var all = await repository.ListAsync(tenant, ct);
        return new CategoryResolver(repository, db, tenant, all);
    }

    public async Task<List<Guid>> ResolveAsync(string raw, CancellationToken ct)
    {
        var ids = new List<Guid>();
        if (string.IsNullOrWhiteSpace(raw)) return ids;

        foreach (var pathStr in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var leaf = await ResolvePathAsync(pathStr, ct);
            if (leaf is not null && !ids.Contains(leaf.Id))
                ids.Add(leaf.Id);
        }
        return ids;
    }

    private async Task<Category?> ResolvePathAsync(string pathStr, CancellationToken ct)
    {
        var names = pathStr.Split('>', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Category? parent = null;
        var slugAccum = "";

        foreach (var name in names)
        {
            var slug = Slug.Create(name);
            if (slug.IsFailure) return parent; // nombre no slugificable → corto acá
            slugAccum = slugAccum.Length == 0 ? slug.Value.Value : $"{slugAccum}/{slug.Value.Value}";

            if (_byPath.TryGetValue(slugAccum, out var existing))
            {
                parent = existing;
                continue;
            }

            var created = Category.Create(_tenant, name, parent);
            if (created.IsFailure) return parent; // ej: supera MaxDepth
            var category = created.Value;

            await _repository.AddAsync(category, ct);
            await _db.SaveChangesAsync(ct);
            _byPath[category.Path] = category;
            parent = category;
        }

        return parent;
    }
}
