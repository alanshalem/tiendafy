using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Logging;
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

    /// <summary>
    /// Región para firmar. MinIO no la mira; Cloudflare R2 firma con "auto" y
    /// rechaza la petición si el SDK deduce otra del endpoint.
    /// </summary>
    public string? Region { get; init; }

    /// <summary>
    /// ¿La URL pública lleva el nombre del bucket?
    ///
    /// MinIO y S3 path-style sirven en {base}/{bucket}/{key}. R2 con dominio
    /// propio (img.tutienda.com) publica el objeto en la RAÍZ: ahí el bucket
    /// sobra y meterlo devuelve 404 en cada imagen.
    /// </summary>
    public bool BucketInPublicUrl { get; init; } = true;

    /// <summary>URL pública de un objeto del bucket de media.</summary>
    public string PublicUrl(string key) =>
        BucketInPublicUrl
            ? $"{PublicBaseUrl.TrimEnd('/')}/{Bucket}/{key}"
            : $"{PublicBaseUrl.TrimEnd('/')}/{key}";

    /// <summary>
    /// Clave de storage a partir de una URL nuestra, o null si es de otro lado
    /// (las imágenes re-hospedadas de un proveedor no se borran).
    /// </summary>
    public string? KeyFromUrl(string url)
    {
        if (BucketInPublicUrl)
        {
            var marker = $"/{Bucket}/";
            var idx = url.IndexOf(marker, StringComparison.Ordinal);
            return idx < 0 ? null : url[(idx + marker.Length)..];
        }

        var prefix = PublicBaseUrl.TrimEnd('/') + "/";
        return url.StartsWith(prefix, StringComparison.Ordinal) ? url[prefix.Length..] : null;
    }

    /// <summary>
    /// Clave de un objeto de ESTA tienda, o null. Exige que la URL sea
    /// exactamente la que armamos (<see cref="PublicUrl"/>) para una clave
    /// bajo <c>{tenantId}/</c>, sin segmentos vacíos, "." ni ".." ni nada que
    /// el cliente de S3 o el navegador puedan reinterpretar: con
    /// <see cref="KeyFromUrl"/> solo, la URL de una foto de otra tienda daba
    /// una clave de esa tienda, y borrarla borraba su foto.
    /// </summary>
    public string? TenantKeyFromUrl(Guid tenantId, string url)
    {
        var key = KeyFromUrl(url);
        if (key is null
            || !key.StartsWith($"{tenantId}/", StringComparison.Ordinal)
            || !string.Equals(PublicUrl(key), url, StringComparison.Ordinal))
            return null;

        if (key.IndexOfAny(['\\', '?', '#', '%']) >= 0
            || key.Split('/').Any(segment => segment is "" or "." or ".."))
            return null;

        return key;
    }

    /// <summary>
    /// ¿Es una URL de nuestro bucket que NO es de esta tienda? Una foto de un
    /// proveedor (otro host) no lo es: esas sí se pueden usar.
    /// </summary>
    public bool IsForeignMedia(Guid tenantId, string url)
    {
        var key = KeyFromUrl(url);
        if (key is null || !string.Equals(PublicUrl(key), url, StringComparison.Ordinal))
            return false;
        return TenantKeyFromUrl(tenantId, url) is null;
    }
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

    /// <summary>
    /// Borra el objeto de una URL nuestra de ESTA tienda (best-effort). Ignora
    /// las URLs externas y no borra nada de otra tienda (lo loguea).
    /// </summary>
    Task DeleteAsync(Guid tenantId, string url, CancellationToken ct = default);
}

/// <summary>
/// Storage S3-compatible (MinIO en dev, S3/R2 en prod — mismo SDK).
/// Claves por tenant: {tenantId}/{guid}.{ext} — el aislamiento real
/// es a nivel clave; el bucket es público de solo lectura.
/// </summary>
public sealed class S3MediaStorage(
    IAmazonS3 s3, MediaOptions options, ILogger<S3MediaStorage>? logger = null) : IMediaStorage
{
    // Sin firmar el contenido y sin checksum al final: sobre https, AWSSDK.S3
    // manda el cuerpo en trozos firmados con el checksum al final (Streaming
    // SigV4), R2 lo rechaza y la subida falla con un 500. Es lo que pide la
    // documentación de R2 para este SDK; el contenido igual viaja cifrado. Por
    // http (el MinIO de desarrollo) el SDK no permite dejar de firmar, y ahí
    // tampoco hace falta: MinIO acepta los trozos.
    private readonly bool unsignedPayload =
        options.Endpoint.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
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
                "Media.UnsupportedType", "Ese tipo de archivo no se puede subir. Usá JPG, PNG, WebP, AVIF o SVG para imágenes, y MP4 o WebM para videos."));

        var isSvg = type == SvgType;
        var max = isSvg ? MaxSvgBytes
            : type.StartsWith("video/", StringComparison.Ordinal) ? MaxVideoBytes
            : MaxImageBytes;
        if (length <= 0)
            return Result.Failure<string>(Error.Validation("Media.Empty", "El archivo está vacío."));
        if (length > max)
            return Result.Failure<string>(Error.Validation(
                "Media.TooLarge", $"El archivo pesa demasiado: el máximo es {max / 1024 / 1024} MB."));

        // Stream que efectivamente subimos. Para SVG lo reemplazamos por el contenido
        // saneado; para el resto subimos el original tras validar magic bytes.
        Stream upload = content;
        MemoryStream? sanitizedStream = null;

        if (isSvg)
        {
            // SVG es texto (no tiene magic bytes): lo leemos entero, lo reescribimos
            // con solo lo que dibuja (ver SvgSanitizer) y subimos esa versión.
            // Defensa en profundidad: logo/favicon se renderizan por <img>/<link
            // rel=icon>, que no ejecutan scripts igual.
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

            var put = new PutObjectRequest
            {
                BucketName = options.Bucket,
                Key = key,
                InputStream = upload,
                // El tipo ya validado (en minúsculas), no el texto que mandó el cliente.
                ContentType = type,
                DisablePayloadSigning = unsignedPayload,
                DisableDefaultChecksumValidation = true,
            };
            // Un SVG abierto por su URL directa es un documento del origen del
            // bucket: con "attachment" el navegador lo descarga en vez de
            // renderizarlo. En <img> y <link rel=icon> se sigue viendo igual.
            if (isSvg) put.Headers.ContentDisposition = "attachment";

            await s3.PutObjectAsync(put, ct);

            return options.PublicUrl(key);
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
            DisablePayloadSigning = unsignedPayload,
            DisableDefaultChecksumValidation = true,
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
            // El SDK firma https por defecto aunque el endpoint sea http: con
            // MinIO de desarrollo los adjuntos del chat salían con un link roto.
            Protocol = options.Endpoint.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                ? Protocol.HTTP
                : Protocol.HTTPS,
        });

    public async Task DeleteAsync(Guid tenantId, string url, CancellationToken ct = default)
    {
        try
        {
            if (options.KeyFromUrl(url) is null) return; // URL externa (no re-hospedada): no la tocamos.

            // El bucket es uno para todas las tiendas: solo se borra lo que
            // está bajo la carpeta de la tienda que pide.
            var key = options.TenantKeyFromUrl(tenantId, url);
            if (key is null)
            {
                logger?.LogWarning(
                    "Media: no se borra {Url}, no es un objeto de la tienda {TenantId}.",
                    LogValue.Safe(url), tenantId);
                return;
            }
            await s3.DeleteObjectAsync(options.Bucket, key, ct);
        }
        catch
        {
            // best-effort: si el objeto ya no está o falla, seguimos.
        }
    }

}
