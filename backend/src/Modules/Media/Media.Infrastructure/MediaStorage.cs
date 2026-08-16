using System.Text;
using System.Text.RegularExpressions;
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
            var sanitized = SanitizeSvg(raw.ToArray());
            if (sanitized.IsFailure)
                return Result.Failure<string>(sanitized.Error);
            sanitizedStream = new MemoryStream(sanitized.Value);
            upload = sanitizedStream;
        }
        else if (content.CanSeek)
        {
            // El content-type del cliente no es confiable: verificamos "magic bytes" del
            // contenido real para que no suban un script/HTML disfrazado de imagen.
            if (!await VerifyMagicAsync(content, type, ct))
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
            if (!await VerifyMagicAsync(content, type, ct))
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

    private static async Task<int> ReadHeaderAsync(Stream content, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var n = await content.ReadAsync(buffer.AsMemory(total, buffer.Length - total), ct);
            if (n == 0) break;
            total += n;
        }
        return total;
    }

    /// <summary>¿Los bytes iniciales corresponden al tipo declarado? (anti content-type spoofing)</summary>
    private static bool MatchesMagic(string type, byte[] h, int len)
    {
        if (len < 12) return false;

        bool Eq(int off, params byte[] sig)
        {
            if (off + sig.Length > len) return false;
            for (var i = 0; i < sig.Length; i++)
                if (h[off + i] != sig[i]) return false;
            return true;
        }
        bool Ascii(int off, string s)
        {
            if (off + s.Length > len) return false;
            for (var i = 0; i < s.Length; i++)
                if (h[off + i] != (byte)s[i]) return false;
            return true;
        }
        bool IsoFtyp() => Ascii(4, "ftyp"); // ISO-BMFF: mp4/avif comparten "ftyp" en offset 4

        return type switch
        {
            "image/jpeg" => Eq(0, 0xFF, 0xD8, 0xFF),
            "image/png" => Eq(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            "image/webp" => Ascii(0, "RIFF") && Ascii(8, "WEBP"),
            "image/avif" => IsoFtyp(),
            "video/mp4" => IsoFtyp(),
            "video/webm" => Eq(0, 0x1A, 0x45, 0xDF, 0xA3),
            _ => false,
        };
    }

    // Saneo de SVG: timeout corto en cada regex para descartar cualquier ReDoS sobre
    // input adversario (el contenido ya está acotado a 1 MB, pero por las dudas).
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

    private static string Scrub(string input, string pattern) =>
        Regex.Replace(input, pattern, string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.Singleline, RegexTimeout);

    /// <summary>
    /// Saca de un SVG todo lo que pueda ejecutar código si el archivo se abriera como
    /// documento: &lt;script&gt;, manejadores on*, &lt;foreignObject&gt; (puede contener HTML/JS),
    /// DOCTYPE/ENTITY (XXE / billion-laughs) y URIs javascript:. Devuelve los bytes limpios.
    /// </summary>
    private static Result<byte[]> SanitizeSvg(byte[] raw)
    {
        string svg;
        try
        {
            // SVG es UTF-8/ASCII; rechazá BOM/encoding raro decodificando estricto-ish.
            svg = Encoding.UTF8.GetString(raw);
        }
        catch
        {
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo SVG no es válido."));
        }

        // Tiene que parecer un SVG real (no HTML/script disfrazado).
        if (svg.IndexOf("<svg", StringComparison.OrdinalIgnoreCase) < 0)
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo no es un SVG válido."));

        try
        {
            svg = Scrub(svg, @"<!DOCTYPE[^>]*>");
            svg = Scrub(svg, @"<!ENTITY[^>]*>");
            svg = Scrub(svg, @"<\?xml-stylesheet[^>]*\?>");
            svg = Scrub(svg, @"<script\b[^>]*>.*?</script\s*>");
            svg = Scrub(svg, @"<script\b[^>]*/?>");
            svg = Scrub(svg, @"<foreignObject\b[^>]*>.*?</foreignObject\s*>");
            svg = Scrub(svg, @"<foreignObject\b[^>]*/?>");
            // Manejadores de eventos: onload=, onclick=, etc. El separador puede ser
            // whitespace O '/' (los navegadores aceptan <svg/onload=…> como atributo).
            svg = Scrub(svg, @"[\s/]on\w+\s*=\s*(""[^""]*""|'[^']*'|[^\s>]+)");
            // URIs javascript: en href / xlink:href / src.
            svg = Scrub(svg, @"(?:href|xlink:href|src)\s*=\s*(?:""\s*javascript:[^""]*""|'\s*javascript:[^']*'|javascript:[^\s>]*)");
        }
        catch (RegexMatchTimeoutException)
        {
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "No pudimos procesar el SVG. Probá con otro archivo."));
        }

        return Encoding.UTF8.GetBytes(svg);
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
    /// <summary>Verifica los magic bytes del contenido real contra el tipo declarado (rebobina el stream).</summary>
    private static async Task<bool> VerifyMagicAsync(Stream content, string type, CancellationToken ct)
    {
        var header = new byte[16];
        var read = await ReadHeaderAsync(content, header, ct);
        content.Seek(0, SeekOrigin.Begin);
        return type == "application/pdf"
            ? read >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46 // %PDF
            : MatchesMagic(type, header, read);
    }

}
