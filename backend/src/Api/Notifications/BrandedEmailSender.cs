using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Tenancy.Infrastructure.Persistence;
using Themes.Infrastructure;

namespace Api.Notifications;

/// <summary>Identidad visual de la tienda para emails: nombre + logo + color.</summary>
public sealed record EmailBranding(string StoreName, string? LogoUrl, string PrimaryColor);

/// <summary>
/// Envía emails envueltos en el layout maestro brandeado de la tienda
/// (logo y color primario del tema publicado + footer). Único punto de
/// salida para emails de tenants; IEmailSender queda como transporte crudo.
/// </summary>
public sealed class BrandedEmailSender(
    IEmailSender inner,
    TenancyDbContext tenancy,
    ThemesDbContext themes,
    global::Notifications.Infrastructure.NotificationsDbContext notifications,
    ILogger<BrandedEmailSender> logger)
{
    /// <summary>
    /// Dominio de las direcciones de relleno de las ventas sin email (venta
    /// manual sin datos del comprador): no son casillas de nadie y nunca reciben mail.
    /// </summary>
    public const string PlaceholderDomain = "@sin-email.local";

    public static bool IsPlaceholder(string? email) =>
        email is not null && email.Trim().EndsWith(PlaceholderDomain, StringComparison.OrdinalIgnoreCase);

    /// <param name="replyTo">A dónde van las respuestas (la respuesta a un mensaje de contacto vuelve a quien la escribió).</param>
    /// <returns>
    /// Si el email salió: false si Resend lo rechazó o la dirección es de relleno.
    /// No tira por errores del proveedor (ver <see cref="IEmailSender.SendAsync"/>).
    /// </returns>
    public async Task<bool> SendAsync(Guid tenantId, string toEmail, string subject, string bodyHtml, CancellationToken ct = default, string? template = null, string? replyTo = null)
    {
        if (IsPlaceholder(toEmail)) return false;

        var branding = await ResolveBrandingAsync(tenantId, ct);
        // El remitente visible es la tienda ("Mi Tienda <no-reply@…>"), no la plataforma.
        var sent = await inner.SendAsync(toEmail, subject, EmailLayout.Render(branding, bodyHtml),
            fromName: branding.StoreName, replyTo: replyTo, ct: ct, tenantTag: tenantId.ToString());

        // Contador de uso (panel de costos del merchant). Nunca rompe el envío.
        try
        {
            notifications.NotificationEvents.Add(
                global::Notifications.Infrastructure.NotificationEvent.Email(tenantId, template));
            await notifications.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo registrar el envío de email (tenant {TenantId}).", tenantId);
        }
        return sent;
    }

    public async Task<EmailBranding> ResolveBrandingAsync(Guid tenantId, CancellationToken ct = default)
    {
        var storeName = await tenancy.Tenants.AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "Tu tienda";

        string? logo = null;
        var color = "#1a1a1a";
        try
        {
            var config = await themes.Themes.AsNoTracking()
                .Where(t => t.TenantId == tenantId)
                .Select(t => t.PublishedConfig)
                .FirstOrDefaultAsync(ct);
            if (!string.IsNullOrEmpty(config))
            {
                using var doc = JsonDocument.Parse(config);
                var root = doc.RootElement;
                if (root.TryGetProperty("logo", out var l) && l.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(l.GetString()))
                    logo = l.GetString();
                if (root.TryGetProperty("colors", out var colors)
                    && colors.TryGetProperty("primary", out var p) && p.ValueKind == JsonValueKind.String)
                {
                    // El tema guarda "R G B" (ej. "232 80 30") → hex para email.
                    var parts = (p.GetString() ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length == 3
                        && byte.TryParse(parts[0], out var r)
                        && byte.TryParse(parts[1], out var g)
                        && byte.TryParse(parts[2], out var b))
                        color = $"#{r:x2}{g:x2}{b:x2}";
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo leer el tema para branding de email (tenant {TenantId}).", tenantId);
        }

        return new EmailBranding(storeName, logo, color);
    }
}

/// <summary>
/// Layout maestro de emails: 600px, tablas con estilos inline (estándar de
/// clientes de correo), header con logo o nombre, cuerpo en tarjeta y footer
/// discreto. El contenido de la plantilla del admin va adentro sin tocar.
/// </summary>
public static class EmailLayout
{
    public static string Render(EmailBranding b, string bodyHtml)
    {
        var storeName = WebUtility.HtmlEncode(b.StoreName);
        var header = !string.IsNullOrEmpty(b.LogoUrl)
            ? $"<img src=\"{WebUtility.HtmlEncode(b.LogoUrl)}\" alt=\"{storeName}\" style=\"max-height:56px;max-width:220px;display:block;margin:0 auto\" />"
            : $"<span style=\"font-size:22px;font-weight:700;color:#111;letter-spacing:.5px\">{storeName}</span>";

        return $@"<!DOCTYPE html>
<html lang=""es"">
<body style=""margin:0;padding:0;background-color:#f4f4f5"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background-color:#f4f4f5;padding:24px 0"">
    <tr><td align=""center"">
      <table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" style=""width:600px;max-width:94%"">
        <tr><td style=""height:4px;background-color:{b.PrimaryColor};border-radius:8px 8px 0 0""></td></tr>
        <tr><td align=""center"" style=""background-color:#ffffff;padding:28px 24px 12px"">{header}</td></tr>
        <tr><td style=""background-color:#ffffff;padding:8px 32px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#27272a"">
          {bodyHtml}
        </td></tr>
        <tr><td style=""background-color:#fafafa;border-radius:0 0 8px 8px;padding:16px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;text-align:center"">
          {storeName}<br/>
          Este email fue enviado automáticamente, por favor no lo respondas.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";
    }
}
