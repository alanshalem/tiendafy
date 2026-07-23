using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Notifications;

/// <summary>Cifra/descifra los access tokens de WhatsApp en reposo (DataProtection,
/// mismo esquema que los tokens de MercadoPago).</summary>
public sealed class WhatsAppTokenProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("tiendafy.whatsapp.tokens");
    public string Protect(string token) => _protector.Protect(token);
    public string Unprotect(string encrypted) => _protector.Unprotect(encrypted);
}

/// <summary>
/// Envía mensajes de plantilla por WhatsApp Cloud API (Meta Graph API) con las
/// credenciales del tenant. Reintentos con backoff ante errores transitorios.
/// Solo plantillas pre-aprobadas por Meta: fuera de la ventana de 24 hs no se
/// puede mandar texto libre.
/// </summary>
public sealed class WhatsAppSender(HttpClient http, ILogger<WhatsAppSender> logger)
{
    private const string GraphBase = "https://graph.facebook.com/v20.0";
    private static readonly TimeSpan[] Backoff = [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3)];

    /// <returns>true si Meta aceptó el mensaje.</returns>
    public async Task<bool> SendTemplateAsync(
        string phoneNumberId, string accessToken, string toE164,
        string templateName, string languageCode, IReadOnlyList<string> bodyParams,
        CancellationToken ct = default)
    {
        var payload = new
        {
            messaging_product = "whatsapp",
            to = toE164,
            type = "template",
            template = new
            {
                name = templateName,
                language = new { code = languageCode },
                components = bodyParams.Count == 0 ? null : new object[]
                {
                    new
                    {
                        type = "body",
                        parameters = bodyParams.Select(p => new { type = "text", text = p }).ToArray(),
                    },
                },
            },
        };

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{GraphBase}/{phoneNumberId}/messages")
                {
                    Content = JsonContent.Create(payload, options: new System.Text.Json.JsonSerializerOptions
                    {
                        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                    }),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                using var resp = await http.SendAsync(req, ct);
                if (resp.IsSuccessStatusCode)
                {
                    logger.LogInformation("WhatsApp enviado → {To} · {Template}", toE164, templateName);
                    return true;
                }

                var body = await resp.Content.ReadAsStringAsync(ct);
                var transient = resp.StatusCode == HttpStatusCode.TooManyRequests || (int)resp.StatusCode >= 500;
                if (!transient || attempt >= Backoff.Length)
                {
                    // 4xx definitivo: plantilla inexistente/no aprobada, token vencido,
                    // número no habilitado… reintentar no ayuda.
                    logger.LogError("WhatsApp Cloud API {Status} → {To} · {Template}: {Body}",
                        (int)resp.StatusCode, toE164, templateName, body);
                    return false;
                }
                logger.LogWarning("WhatsApp {Status} transitorio, reintento {Attempt} → {To}",
                    (int)resp.StatusCode, attempt + 1, toE164);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (attempt >= Backoff.Length)
                {
                    logger.LogError(ex, "WhatsApp falló al enviar a {To} tras {Attempts} intentos.", toE164, attempt + 1);
                    return false;
                }
                logger.LogWarning(ex, "Error de red con WhatsApp, reintento {Attempt} → {To}", attempt + 1, toE164);
            }

            await Task.Delay(Backoff[attempt], ct);
        }
    }

    /// <summary>
    /// Normaliza un teléfono argentino a E.164 sin '+' (formato de la Cloud API).
    /// "11 2345-6789" → 5491123456789. Devuelve null si no parece un número usable.
    /// </summary>
    public static string? NormalizeArPhone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string([.. raw.Where(char.IsDigit)]);
        if (digits.Length < 8) return null;

        // Ya internacional con 54: asegurar el 9 de celular después del 54.
        if (digits.StartsWith("549", StringComparison.Ordinal)) return digits.Length is >= 12 and <= 13 ? digits : null;
        if (digits.StartsWith("54", StringComparison.Ordinal))
        {
            var rest = digits[2..];
            return rest.Length is >= 10 and <= 11 ? "549" + rest.TrimStart('0') : null;
        }

        // Nacional: sacar 0 inicial y el 15 de celular viejo ("011 15-2345-6789").
        var national = digits.TrimStart('0');
        if (national.Length >= 10 && (national.StartsWith("11", StringComparison.Ordinal) || national[0] is '2' or '3'))
        {
            // "11 15 23456789" → quitar el 15 posterior a la característica.
            if (national.Length >= 12 && national.Substring(2, 2) == "15")
                national = national[..2] + national[4..];
            else if (national.Length == 12 && national.Substring(3, 2) == "15")
                national = national[..3] + national[5..];
            else if (national.Length == 12 && national.Substring(4, 2) == "15")
                national = national[..4] + national[6..];
            return national.Length == 10 ? "549" + national : null;
        }

        return null;
    }
}
