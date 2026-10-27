using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Logging;

namespace Media.Infrastructure;

/// <summary>Lo que hizo una pasada de <see cref="SvgResanitizer"/>.</summary>
/// <param name="Checked">SVG encontrados en el bucket público.</param>
/// <param name="Rewritten">Los que se volvieron a subir (saneados y/o con <c>attachment</c>).</param>
/// <param name="Unsanitizable">Los que el sanitizador rechaza: quedan como estaban pero con <c>attachment</c>.</param>
public sealed record SvgResanitizeReport(int Checked, int Rewritten, int Unsanitizable);

/// <summary>
/// Paso de mantenimiento, una sola vez después del deploy que cambió el
/// sanitizador de SVG (<c>dotnet Api.dll resanitize-svg</c>): el sanitizador
/// nuevo y el <c>Content-Disposition: attachment</c> solo se aplicaban a lo que
/// se subía de ahí en adelante, y los SVG de antes —que pasaron por el de
/// expresiones regulares, con bypass conocidos— se seguían sirviendo en línea.
///
/// Recorre los <c>.svg</c> del bucket público, los re-sanea con
/// <see cref="SvgSanitizer"/> y los vuelve a subir en la misma clave (las URLs
/// no cambian) con <c>attachment</c>. Idempotente: lo que ya está saneado y con
/// <c>attachment</c> no se toca. Lo que el sanitizador rechaza no se borra (es
/// el logo de alguien): queda con <c>attachment</c>, que alcanza para que abrirlo
/// por su URL lo descargue en vez de renderizarlo (en <c>&lt;img&gt;</c> un SVG no
/// ejecuta scripts), y se loguea para revisarlo a mano.
/// </summary>
public sealed class SvgResanitizer(IAmazonS3 s3, MediaOptions options, ILogger<SvgResanitizer> logger)
{
    private const string SvgType = "image/svg+xml";

    // Igual que S3MediaStorage: R2 (https) rechaza el cuerpo en trozos firmados.
    private readonly bool unsignedPayload =
        options.Endpoint.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    public async Task<SvgResanitizeReport> RunAsync(CancellationToken ct = default)
    {
        int found = 0, rewritten = 0, unsanitizable = 0;
        string? token = null;
        do
        {
            var page = await s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = options.Bucket,
                ContinuationToken = token,
            }, ct);

            foreach (var key in (page.S3Objects ?? []).Select(o => o.Key))
            {
                if (!key.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)) continue;
                found++;

                byte[] raw;
                string? disposition, contentType;
                using (var get = await s3.GetObjectAsync(options.Bucket, key, ct))
                {
                    using var buffer = new MemoryStream();
                    await get.ResponseStream.CopyToAsync(buffer, ct);
                    raw = buffer.ToArray();
                    disposition = get.Headers.ContentDisposition;
                    contentType = get.Headers.ContentType;
                }

                var sanitized = SvgSanitizer.Sanitize(raw);
                if (sanitized.IsFailure)
                {
                    unsanitizable++;
                    logger.LogWarning(
                        "SVG {Key}: el sanitizador lo rechaza ({Reason}). Queda como estaba, con attachment: revisalo a mano.",
                        key, sanitized.Error.Message);
                }

                var body = sanitized.IsSuccess ? sanitized.Value : raw;
                // Ya hecho (en una pasada anterior o al subirlo): mismo contenido y attachment.
                var done = body.AsSpan().SequenceEqual(raw)
                    && string.Equals(disposition?.Trim(), "attachment", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(contentType, SvgType, StringComparison.OrdinalIgnoreCase);
                if (done) continue;

                using var upload = new MemoryStream(body);
                var put = new PutObjectRequest
                {
                    BucketName = options.Bucket,
                    Key = key,
                    InputStream = upload,
                    ContentType = SvgType,
                    DisablePayloadSigning = unsignedPayload,
                    DisableDefaultChecksumValidation = true,
                };
                put.Headers.ContentDisposition = "attachment";
                await s3.PutObjectAsync(put, ct);
                rewritten++;
            }

            token = page.IsTruncated == true ? page.NextContinuationToken : null;
        }
        while (token is not null);

        logger.LogInformation(
            "SVG del bucket {Bucket}: {Checked} revisados, {Rewritten} vueltos a subir, {Unsanitizable} que el sanitizador rechaza.",
            options.Bucket, found, rewritten, unsanitizable);
        return new SvgResanitizeReport(found, rewritten, unsanitizable);
    }
}
