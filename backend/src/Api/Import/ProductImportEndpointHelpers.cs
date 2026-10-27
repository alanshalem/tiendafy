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


    /// <summary>
    /// Topes de la subida masiva de fotos. El pedido entero (archivos sueltos,
    /// .zip y CSV de mapeo) hasta <see cref="ImportLimits.MaxRequestBytes"/>; de
    /// los .zip, lo descomprimido se cuenta byte a byte mientras se escribe, sin
    /// creer lo que el .zip dice de sí mismo.
    /// </summary>
    public sealed record ImportLimits(int MaxEntries, long MaxEntryBytes, long MaxTotalBytes)
    {
        /// <summary>1 GB por subida: miles de fotos de catálogo, y un tope para el disco y la red.</summary>
        public const long MaxRequestBytes = 1024L * 1024 * 1024;

        /// <summary>Entradas (archivos y carpetas) entre todos los .zip; fotos por foto, 5 MB como cualquier imagen; 2 GB descomprimidos en total.</summary>
        public static readonly ImportLimits Default = new(
            MaxEntries: 10_000,
            MaxEntryBytes: Media.Infrastructure.S3MediaStorage.MaxImageBytes,
            MaxTotalBytes: 2L * 1024 * 1024 * 1024);
    }

    /// <summary>Lo que va quedando de los topes, compartido entre todos los .zip de una subida.</summary>
    public sealed class ExtractionBudget(ImportLimits limits)
    {
        public ImportLimits Limits { get; } = limits;
        public int Entries { get; set; }
        public long Bytes { get; set; }
    }

    /// <summary>
    /// Extrae las imágenes de un .zip al dir temporal (aplana, nombre base).
    /// Devuelve cuántas extrajo, o un error si el .zip está dañado, trae una
    /// ruta con ".." o absoluta, o pasa los topes de <paramref name="budget"/>.
    /// Una foto que pasa el máximo de una imagen se saltea (igual no se podría subir).
    /// </summary>
    public static async Task<Result<int>> ExtractZipAsync(
        IFormFile file, string tempDir, ExtractionBudget budget, CancellationToken ct)
    {
        var limits = budget.Limits;
        var count = 0;
        try
        {
            await using var stream = file.OpenReadStream();
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            foreach (var entry in archive.Entries)
            {
                if (++budget.Entries > limits.MaxEntries)
                    return Result.Failure<int>(Error.Validation("Import.ZipTooManyFiles",
                        $"El .zip trae demasiados archivos: el máximo es {ArgentineNumbers.Number(limits.MaxEntries)} por subida."));

                if (IsUnsafeEntryPath(entry.FullName))
                    return Result.Failure<int>(Error.Validation("Import.ZipBadPath",
                        "El .zip tiene archivos con rutas no permitidas. Armalo de nuevo con las fotos sueltas o en carpetas."));

                if (string.IsNullOrEmpty(entry.Name)) continue; // carpeta
                if (!ImportMedia.ImageExtensions.Contains(Path.GetExtension(entry.Name))) continue;

                var dest = Path.Combine(tempDir, SafeFileName(entry.Name));
                long? written;
                await using (var es = entry.Open())
                await using (var fs = File.Create(dest))
                {
                    var room = Math.Min(limits.MaxEntryBytes, limits.MaxTotalBytes - budget.Bytes);
                    written = await CopyCappedAsync(es, fs, room, ct);
                }

                if (written is { } bytes)
                {
                    budget.Bytes += bytes;
                    count++;
                    continue;
                }

                File.Delete(dest);
                // Cortó por el total: el .zip descomprime más de lo que se acepta.
                if (limits.MaxTotalBytes - budget.Bytes < limits.MaxEntryBytes)
                    return Result.Failure<int>(Error.Validation("Import.ZipTooLarge",
                        $"Las fotos del .zip ocupan demasiado: el máximo es {limits.MaxTotalBytes / 1024 / 1024 / 1024} GB descomprimido por subida."));
                // Cortó por la foto: pesa más que cualquier imagen permitida, se saltea.
            }
        }
        // Un archivo más corto que el final de un .zip hace que el lector
        // intente posicionarse antes del comienzo.
        catch (Exception ex) when (ex is InvalidDataException or ArgumentOutOfRangeException)
        {
            return Result.Failure<int>(Error.Validation("Import.ZipCorrupt",
                "No pudimos abrir el .zip: está dañado o no es un .zip."));
        }
        return count;
    }

    /// <summary>
    /// ¿Ruta de entrada con "..", absoluta o con unidad? Se aplana igual al
    /// extraer, pero un .zip así no lo arma ningún compresor: se rechaza.
    /// </summary>
    public static bool IsUnsafeEntryPath(string fullName)
    {
        if (fullName.Length == 0) return false;
        if (fullName[0] is '/' or '\\' || fullName.Contains(':')) return true;
        return fullName.Split('/', '\\').Any(segment => segment == "..");
    }

    /// <summary>
    /// Copia hasta <paramref name="max"/> bytes. Devuelve lo copiado, o null si
    /// la fuente tenía más (corta ahí: no lee el resto).
    /// </summary>
    public static async Task<long?> CopyCappedAsync(Stream source, Stream destination, long max, CancellationToken ct)
    {
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, ct)) > 0)
        {
            total += read;
            if (total > max) return null;
            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
        }
        return total;
    }

    /// <summary>Nombre de archivo seguro: solo el basename, sin componentes de path.</summary>
    public static string SafeFileName(string name) => Path.GetFileName(name);
}
