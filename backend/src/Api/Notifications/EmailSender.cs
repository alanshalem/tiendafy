using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Api.Notifications;

public sealed class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>API key de Resend. Vacío = modo dev (loguea, no envía).</summary>
    public string ResendApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Remitente. En dev usá onboarding@resend.dev; en prod, una dirección de un
    /// dominio verificado en Resend (ej: "Tiendafy &lt;no-reply@tiendafy.com&gt;").
    /// El nombre visible se reemplaza por el de la tienda al enviar.
    /// </summary>
    public string From { get; set; } = "Tiendafy <onboarding@resend.dev>";

    /// <summary>Reintentos ante errores transitorios (429/5xx/red). 0 = sin retry.</summary>
    public int MaxRetries { get; set; } = 2;
}

/// <summary>Un archivo adjunto (la factura en PDF, por ejemplo).</summary>
public sealed record EmailAttachment(string FileName, byte[] Content);

public interface IEmailSender
{
    /// <param name="fromName">Nombre visible del remitente (la tienda). Null = el del From configurado.</param>
    /// <param name="replyTo">A dónde van las respuestas del cliente (email de la tienda). Null = sin reply-to.</param>
    /// <param name="tenantTag">Tag "tenant" para Resend: los webhooks (bounces) lo devuelven y permiten atribuir la supresión a la tienda correcta.</param>
    /// <param name="attachments">Adjuntos. Null o vacío = sin adjuntos.</param>
    /// <returns>
    /// true si Resend aceptó el email (o, en modo dev, si se escribió en el log);
    /// false si lo rechazó o se agotaron los reintentos. Nunca tira por un error
    /// del proveedor: quien manda un transaccional puede ignorar el resultado y
    /// seguir; las campañas lo usan para contar los fallidos.
    /// </returns>
    Task<bool> SendAsync(string toEmail, string subject, string htmlBody,
        string? fromName = null, string? replyTo = null, CancellationToken ct = default, string? tenantTag = null,
        IReadOnlyList<EmailAttachment>? attachments = null);
}

/// <summary>
/// Envía emails por Resend (HTTP API, sin el quilombo de SMTP). Sin API key,
/// modo dev: loguea en vez de enviar. Con clave: remitente con el nombre de la
/// tienda, reply-to opcional, reintentos con backoff ante errores transitorios
/// e Idempotency-Key estable por envío (un retry jamás duplica el email).
/// </summary>
public sealed class EmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<EmailSender> logger) : IEmailSender
{
    private static readonly TimeSpan[] Backoff = [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(8)];

    private readonly EmailOptions _o = options.Value;

    public async Task<bool> SendAsync(string toEmail, string subject, string htmlBody,
        string? fromName = null, string? replyTo = null, CancellationToken ct = default, string? tenantTag = null,
        IReadOnlyList<EmailAttachment>? attachments = null)
    {
        // En logs el destinatario va SIEMPRE enmascarado (PII) y sanitizado
        // (anti log-forging). El email completo vive en Resend / notification_events.
        var toLog = LogValue.MaskEmail(toEmail);

        if (string.IsNullOrWhiteSpace(_o.ResendApiKey))
        {
            logger.LogInformation("[email:dev] → {To} · {Subject} (from: {From})",
                toLog, LogValue.Safe(subject), BuildFrom(fromName));
            return true;
        }

        // Misma clave en todos los intentos: si el primero llegó pero la respuesta
        // se perdió, Resend deduplica y el cliente no recibe el email dos veces.
        var idempotencyKey = Guid.NewGuid().ToString("N");
        var payload = new
        {
            from = BuildFrom(fromName),
            to = new[] { toEmail },
            subject,
            html = htmlBody,
            reply_to = string.IsNullOrWhiteSpace(replyTo) ? null : new[] { replyTo },
            // El tag vuelve en los webhooks de Resend → atribuye bounces a la tienda.
            tags = string.IsNullOrEmpty(tenantTag) ? null : new[] { new { name = "tenant", value = tenantTag } },
            // Resend recibe el contenido en base64 (máx. 40 MB por email).
            attachments = attachments is { Count: > 0 }
                ? attachments.Select(a => new { filename = a.FileName, content = Convert.ToBase64String(a.Content) }).ToArray()
                : null,
        };

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
                {
                    Content = JsonContent.Create(payload),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _o.ResendApiKey);
                req.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);

                using var resp = await http.SendAsync(req, ct);
                if (resp.IsSuccessStatusCode)
                {
                    logger.LogInformation("Email enviado (Resend) → {To} · {Subject}", toLog, LogValue.Safe(subject));
                    return true;
                }

                var body = await resp.Content.ReadAsStringAsync(ct);
                var transient = resp.StatusCode == HttpStatusCode.TooManyRequests || (int)resp.StatusCode >= 500;
                if (!transient || attempt >= Math.Min(_o.MaxRetries, Backoff.Length))
                {
                    // 4xx definitivo (from inválido, dominio sin verificar…): reintentar no ayuda.
                    logger.LogError("Resend error {Status} enviando a {To} (intento {Attempt}): {Body}",
                        (int)resp.StatusCode, toLog, attempt + 1, LogValue.Body(body));
                    return false;
                }
                logger.LogWarning("Resend {Status} transitorio, reintento {Attempt} en {Delay}s → {To}",
                    (int)resp.StatusCode, attempt + 1, Backoff[attempt].TotalSeconds, toLog);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (attempt >= Math.Min(_o.MaxRetries, Backoff.Length))
                {
                    logger.LogError(ex, "Resend falló al enviar a {To} tras {Attempts} intentos.", toLog, attempt + 1);
                    return false;
                }
                logger.LogWarning(ex, "Error de red con Resend, reintento {Attempt} → {To}", attempt + 1, toLog);
            }

            await Task.Delay(Backoff[attempt], ct);
        }
    }

    /// <summary>"Mi Tienda &lt;no-reply@dominio&gt;": nombre de la tienda + dirección configurada.</summary>
    private string BuildFrom(string? fromName)
    {
        if (string.IsNullOrWhiteSpace(fromName)) return _o.From;
        var lt = _o.From.IndexOf('<');
        var address = lt >= 0 ? _o.From[lt..] : $"<{_o.From.Trim()}>";
        // Sin comillas dobles adentro del display name (rompen el header RFC 5322).
        var safe = fromName.Replace("\"", string.Empty).Trim();
        return $"\"{safe}\" {address}";
    }
}
