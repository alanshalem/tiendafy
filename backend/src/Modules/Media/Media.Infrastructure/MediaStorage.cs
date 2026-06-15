using Amazon.S3;
using Amazon.S3.Model;
using SharedKernel.Common;

namespace Media.Infrastructure;

public sealed record MediaOptions
{
    public required string Endpoint { get; init; }
    public required string PublicBaseUrl { get; init; }
    public required string AccessKey { get; init; }
    public required string SecretKey { get; init; }
    public string Bucket { get; init; } = "tiendafy-media";
}

public interface IMediaStorage
{
    /// <summary>Sube el archivo y devuelve la URL pública.</summary>
    Task<Result<string>> UploadAsync(
        Guid tenantId, Stream content, string contentType, long length, CancellationToken ct = default);

    /// <summary>Borra el objeto de una URL nuestra (best-effort; ignora URLs externas).</summary>
    Task DeleteAsync(string url, CancellationToken ct = default);
}

/// <summary>
/// Storage S3-compatible (MinIO en dev, S3/R2 en prod — mismo SDK).
/// Claves por tenant: {tenantId}/{guid}.{ext} — el aislamiento real
/// es a nivel clave; el bucket es público de solo lectura.
/// </summary>
public sealed class S3MediaStorage(IAmazonS3 s3, MediaOptions options) : IMediaStorage
{
    public const long MaxImageBytes = 5 * 1024 * 1024;   // 5 MB
    public const long MaxVideoBytes = 20 * 1024 * 1024;  // 20 MB (hero loops cortos y comprimidos)

    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
        ["image/avif"] = "avif",
        ["video/mp4"] = "mp4",
        ["video/webm"] = "webm",
    };

    public async Task<Result<string>> UploadAsync(
        Guid tenantId, Stream content, string contentType, long length, CancellationToken ct = default)
    {
        var type = contentType.ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(type, out var extension))
            return Result.Failure<string>(Error.Validation(
                "Media.UnsupportedType", $"Content type '{contentType}' not allowed. Use JPEG, PNG, WebP, AVIF, MP4 or WebM."));

        var max = type.StartsWith("video/", StringComparison.Ordinal) ? MaxVideoBytes : MaxImageBytes;
        if (length <= 0 || length > max)
            return Result.Failure<string>(Error.Validation(
                "Media.TooLarge", $"File must be between 1 byte and {max / 1024 / 1024} MB."));

        var key = $"{tenantId}/{Guid.NewGuid():N}.{extension}";

        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = options.Bucket,
            Key = key,
            InputStream = content,
            ContentType = contentType,
        }, ct);

        return $"{options.PublicBaseUrl.TrimEnd('/')}/{options.Bucket}/{key}";
    }

    public async Task DeleteAsync(string url, CancellationToken ct = default)
    {
        try
        {
            var marker = $"/{options.Bucket}/";
            var idx = url.IndexOf(marker, StringComparison.Ordinal);
            if (idx < 0) return; // URL externa (no re-hospedada): no la tocamos.
            var key = url[(idx + marker.Length)..];
            await s3.DeleteObjectAsync(options.Bucket, key, ct);
        }
        catch
        {
            // best-effort: si el objeto ya no está o falla, seguimos.
        }
    }
}
