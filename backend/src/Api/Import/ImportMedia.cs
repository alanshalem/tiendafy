namespace Api.Import;

/// <summary>Extensiones de imagen aceptadas por los flujos de import de productos.</summary>
public static class ImportMedia
{
    public static readonly HashSet<string> ImageExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp", ".avif" };
}
