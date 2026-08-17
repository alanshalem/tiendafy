using System.IO.Compression;
using Catalog.Core.Domain;
using Microsoft.Extensions.Primitives;
using SharedKernel.Common;

namespace Api.Import;

/// <summary>
/// Helpers de import/export masivo de productos que vivían en ProductEndpoints:
/// paginado completo, paths de categorías, parseo de flags del form y unzip.
/// </summary>
public static class ProductImportEndpointHelpers
{
    /// <summary>Trae TODOS los productos del tenant paginando de a 100 (para el export).</summary>
    public static async Task<List<Product>> LoadAllProductsAsync(
        IProductRepository repository, TenantId tenantId, CancellationToken ct)
    {
        var all = new List<Product>();
        Guid? after = null;
        while (true)
        {
            var page = await repository.ListAsync(tenantId, null, 100, after, ct);
            all.AddRange(page);
            if (page.Count < 100) break;
            after = page[^1].Id;
        }
        return all;
    }

    /// <summary>Mapa id → path display ("Indumentaria > Remeras") subiendo por ParentId.</summary>
    public static Dictionary<Guid, string> BuildCategoryPaths(IReadOnlyList<Category> categories)
    {
        var byId = categories.ToDictionary(c => c.Id);
        return categories.ToDictionary(c => c.Id, c =>
        {
            var names = new List<string>();
            Category? cur = c;
            for (var guard = 0; cur is not null && guard < Category.MaxDepth + 1; guard++)
            {
                names.Insert(0, cur.Name);
                cur = cur.ParentId is { } pid && byId.TryGetValue(pid, out var parent) ? parent : null;
            }
            return string.Join(" > ", names);
        });
    }

    public static bool ParseFormBool(StringValues value, bool fallback)
    {
        var s = value.ToString().Trim().ToLowerInvariant();
        if (s.Length == 0) return fallback;
        return s is "true" or "1" or "on" or "yes" or "si";
    }


    /// <summary>Extrae las imágenes de un .zip al dir temporal (aplana, nombre base).</summary>
    public static async Task<int> ExtractZipAsync(IFormFile file, string tempDir, CancellationToken ct)
    {
        var count = 0;
        await using var stream = file.OpenReadStream();
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name)) continue; // carpeta
            if (!ImportMedia.ImageExtensions.Contains(Path.GetExtension(entry.Name))) continue;

            var dest = Path.Combine(tempDir, SafeFileName(entry.Name));
            await using var es = entry.Open();
            await using var fs = File.Create(dest);
            await es.CopyToAsync(fs, ct);
            count++;
        }
        return count;
    }

    /// <summary>Nombre de archivo seguro: solo el basename, sin componentes de path.</summary>
    public static string SafeFileName(string name) => Path.GetFileName(name);
}
