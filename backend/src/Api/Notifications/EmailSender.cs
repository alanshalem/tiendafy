using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Api.Notifications;

public sealed class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>API key de Resend. Vacío = modo dev (loguea, no envía).</summary>
    public string ResendApiKey { get; set; } = string.Empty;

    /// <summary>Remitente. En dev usá onboarding@resend.dev; en prod, un dominio verificado.</summary>
    public string From { get; set; } = "Tiendafy <onboarding@resend.dev>";
}

public interface IEmailSender
{
    Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default);
}

/// <summary>
/// Envía emails por Resend (HTTP API, sin el quilombo de SMTP). Si no hay API key
/// configurada, modo dev: loguea el email en vez de enviarlo.
/// </summary>
public sealed class EmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<EmailSender> logger) : IEmailSender
{
    private readonly EmailOptions _o = options.Value;

    public async Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_o.ResendApiKey))
        {
            logger.LogInformation("[email:dev] → {To} · {Subject}", toEmail, subject);
            return;
        }

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
            {
                Content = JsonContent.Create(new { from = _o.From, to = new[] { toEmail }, subject, html = htmlBody }),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _o.ResendApiKey);

            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                logger.LogError("Resend error {Status}: {Body}", (int)resp.StatusCode, body);
            }
            else
            {
                logger.LogInformation("Email enviado (Resend) → {To} · {Subject}", toEmail, subject);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Resend falló al enviar a {To}.", toEmail);
        }
    }
}
