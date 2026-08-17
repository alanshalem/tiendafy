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
    /// <summary>Bucket SIN policy pública: adjuntos de chat, solo URLs firmadas.</summary>
    public string PrivateBucket { get; init; } = "tiendafy-private";
}

public interface IMediaStorage
{
    /// <summary>Sube el archivo y devuelve la URL pública.</summary>
    Task<Result<string>> UploadAsync(
        Guid tenantId, Stream content, string contentType, long length, CancellationToken ct = default);

    /// <summary>
    /// Sube un archivo PRIVADO (adjuntos de chat: PDF/JPG/PNG, magic bytes
    /// verificados) y devuelve la CLAVE de storage — nunca una URL pública.
    /// El acceso es solo vía <see cref="GetSignedUrl"/>.
    /// </summary>
    Task<Result<string>> UploadPrivateAsync(
        Guid tenantId, string prefix, Stream content, string contentType, long length, CancellationToken ct = default);

    /// <summary>URL firmada de lectura, de vida corta, para una clave privada.</summary>
    string GetSignedUrl(string key, TimeSpan validFor);

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
    public const long MaxSvgBytes = 1 * 1024 * 1024;     // 1 MB (SVG es texto; cap bajo)

    private const string SvgType = "image/svg+xml";

    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
        ["image/avif"] = "avif",
        [SvgType] = "svg",
        ["video/mp4"] = "mp4",
        ["video/webm"] = "webm",
    };

    public async Task<Result<string>> UploadAsync(
        Guid tenantId, Stream content, string contentType, long length, CancellationToken ct = default)
    {
        var type = contentType.ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(type, out var extension))
            return Result.Failure<string>(Error.Validation(
                "Media.UnsupportedType", $"Content type '{contentType}' not allowed. Use JPEG, PNG, WebP, AVIF, SVG, MP4 or WebM."));

        var isSvg = type == SvgType;
        var max = isSvg ? MaxSvgBytes
            : type.StartsWith("video/", StringComparison.Ordinal) ? MaxVideoBytes
            : MaxImageBytes;
        if (length <= 0 || length > max)
            return Result.Failure<string>(Error.Validation(
                "Media.TooLarge", $"File must be between 1 byte and {max / 1024 / 1024} MB."));

        // Stream que efectivamente subimos. Para SVG lo reemplazamos por el contenido
        // saneado; para el resto subimos el original tras validar magic bytes.
        Stream upload = content;
        MemoryStream? sanitizedStream = null;

        if (isSvg)
        {
            // SVG es texto (no tiene magic bytes): lo leemos entero, lo saneamos
            // (sacamos <script>, on*, foreignObject, DOCTYPE/ENTITY, javascript:) y
            // subimos la versión limpia. Defensa en profundidad: logo/favicon se
            // renderizan por <img>/<link rel=icon>, que no ejecutan scripts igual.
            using var raw = new MemoryStream();
            await content.CopyToAsync(raw, ct);
            var sanitized = SvgSanitizer.Sanitize(raw.ToArray());
            if (sanitized.IsFailure)
                return Result.Failure<string>(sanitized.Error);
            sanitizedStream = new MemoryStream(sanitized.Value);
            upload = sanitizedStream;
        }
        else if (content.CanSeek)
        {
            // El content-type del cliente no es confiable: verificamos "magic bytes" del
            // contenido real para que no suban un script/HTML disfrazado de imagen.
            if (!await MagicBytes.VerifyAsync(content, type, ct))
                return Result.Failure<string>(Error.Validation(
                    "Media.TypeMismatch", "El contenido del archivo no coincide con el tipo declarado."));
        }

        try
        {
            var key = $"{tenantId}/{Guid.NewGuid():N}.{extension}";

            await s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = options.Bucket,
                Key = key,
                InputStream = upload,
                ContentType = contentType,
            }, ct);

            return $"{options.PublicBaseUrl.TrimEnd('/')}/{options.Bucket}/{key}";
        }
        finally
        {
            sanitizedStream?.Dispose();
        }
    }

    public const long MaxAttachmentBytes = 10 * 1024 * 1024; // 10 MB (adjuntos de chat)

    private static readonly Dictionary<string, string> AttachmentTypes = new()
    {
        ["application/pdf"] = "pdf",
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
    };

    public async Task<Result<string>> UploadPrivateAsync(
        Guid tenantId, string prefix, Stream content, string contentType, long length, CancellationToken ct = default)
    {
        var type = contentType.ToLowerInvariant();
        if (!AttachmentTypes.TryGetValue(type, out var extension))
            return Result.Failure<string>(Error.Validation(
                "Media.UnsupportedType", "Solo se permiten archivos PDF, JPG o PNG."));

        if (length <= 0 || length > MaxAttachmentBytes)
            return Result.Failure<string>(Error.Validation(
                "Media.TooLarge", $"El archivo debe pesar hasta {MaxAttachmentBytes / 1024 / 1024} MB."));

        // Extensión declarada no confiable: verificar magic bytes del contenido real.
        if (content.CanSeek)
        {
            if (!await MagicBytes.VerifyAsync(content, type, ct))
                return Result.Failure<string>(Error.Validation(
                    "Media.TypeMismatch", "El contenido del archivo no coincide con el tipo declarado."));
        }

        var safePrefix = string.Join('/', prefix.Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => new string([.. s.Where(char.IsLetterOrDigit)])));
        var key = $"{tenantId}/{safePrefix}/{Guid.NewGuid():N}.{extension}";

        // Bucket privado, separado del de media: no tiene policy de lectura
        // anónima, así que la ÚNICA forma de leer es una URL firmada.
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = options.PrivateBucket,
            Key = key,
            InputStream = content,
            ContentType = contentType,
        }, ct);

        return key;
    }

    public string GetSignedUrl(string key, TimeSpan validFor) =>
        s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = options.PrivateBucket,
            Key = key,
            Expires = DateTime.UtcNow.Add(validFor),
            Verb = HttpVerb.GET,
        });

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
