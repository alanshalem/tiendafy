namespace Api.Import;

/// <summary>
/// Dónde dejan las fotos subidas los jobs de importación de imágenes mientras
/// esperan al worker. La cola vive en memoria: tras un reinicio, lo que quedó
/// en el disco no pertenece a ningún job.
/// </summary>
public static class ImageImportTemp
{
    public static string Root => Path.Combine(Path.GetTempPath(), "tiendafy-img-import");

    public static string NewJobDir(Guid jobId) => Path.Combine(Root, jobId.ToString("N"));

    /// <summary>Borra el dir de un job sin romper: es limpieza, no puede tirar el pedido.</summary>
    public static void TryDelete(string dir, ILogger? logger = null)
    {
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); }
        catch (Exception ex) { logger?.LogWarning(ex, "No pude limpiar {Dir}", dir); }
    }

    /// <summary>
    /// Al arrancar: borra los dirs que quedaron de jobs que ya no existen
    /// (un reinicio o un corte a mitad de la subida). Devuelve cuántos borró.
    /// </summary>
    public static int SweepOrphans(string root, ILogger? logger = null)
    {
        if (!Directory.Exists(root)) return 0;
        var swept = 0;
        foreach (var dir in Directory.EnumerateDirectories(root))
        {
            TryDelete(dir, logger);
            if (!Directory.Exists(dir)) swept++;
        }
        return swept;
    }
}
