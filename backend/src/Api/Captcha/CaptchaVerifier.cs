using System.Text.Json;

namespace Api.Captcha;

/// <summary>
/// Verifica el token de Cloudflare Turnstile. Gated por config: sin
/// `Captcha:Turnstile:Secret`, no se exige captcha (dev anda sin keys).
/// </summary>
public interface ICaptchaVerifier
{
    bool Enabled { get; }
    string? SiteKey { get; }
    Task<bool> VerifyAsync(string? token, CancellationToken ct = default);
}

public sealed class TurnstileVerifier(HttpClient http, IConfiguration cfg) : ICaptchaVerifier
{
    private string? Secret => cfg["Captcha:Turnstile:Secret"];
    public bool Enabled => !string.IsNullOrWhiteSpace(Secret);
    public string? SiteKey => cfg["Captcha:Turnstile:SiteKey"];

    public async Task<bool> VerifyAsync(string? token, CancellationToken ct = default)
    {
        // Sin secret no se verifica: en dev es lo normal, y en producción se
        // deja pasar igual para no cortar las ventas (CaptchaStartupCheck lo
        // avisa como Critical al arrancar y deploy.sh antes de levantar).
        if (!Enabled) return true;
        if (string.IsNullOrWhiteSpace(token)) return false;

        try
        {
            var resp = await http.PostAsync(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                new FormUrlEncodedContent(new Dictionary<string, string> { ["secret"] = Secret!, ["response"] = token }),
                ct);
            if (!resp.IsSuccessStatusCode) return false;
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            return doc.RootElement.TryGetProperty("success", out var s) && s.GetBoolean();
        }
        catch
        {
            return false;
        }
    }
}
