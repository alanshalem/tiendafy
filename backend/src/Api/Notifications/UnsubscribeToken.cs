using System.Net;
using Api.Auth;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Notifications;

/// <summary>
/// Token firmado del link de baja de campañas. SIN vencimiento a propósito:
/// un link de baja tiene que funcionar aunque el email quede meses en la
/// bandeja (derecho del destinatario, y requisito de los ESP).
/// </summary>
public sealed record UnsubscribePayload(Guid TenantId, string Email, Guid? CampaignId = null);

public static class UnsubscribeToken
{
    // Sin vencimiento, y el purpose no se toca: ver SignedToken.
    private static readonly SignedToken<UnsubscribePayload> Token = new("Tiendafy.Marketing.Unsubscribe.v1");

    public static string Protect(IDataProtectionProvider dp, Guid tenantId, string email, Guid? campaignId = null) =>
        Token.Protect(dp, new UnsubscribePayload(tenantId, email.Trim().ToLowerInvariant(), campaignId));

    /// <summary>
    /// El link de "Dejar de recibir novedades" de la tienda para esa dirección:
    /// la página de baja de la API, que anota la dirección en la lista de
    /// supresión de la tienda.
    /// </summary>
    public static string Url(IDataProtectionProvider dp, string apiBase, Guid tenantId, string email) =>
        $"{apiBase}/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(Protect(dp, tenantId, email))}";

    /// <summary>
    /// El pie con ese link que llevan los avisos automáticos de marketing
    /// (reseñas, favoritos, carrito abandonado). Las campañas tienen el suyo.
    /// </summary>
    public static string Footer(IDataProtectionProvider dp, string apiBase, Guid tenantId, string email) =>
        "<p style='color:#a1a1aa;font-size:12px;margin-top:24px'>¿No querés recibir estos emails? "
        + $"<a href='{WebUtility.HtmlEncode(Url(dp, apiBase, tenantId, email))}' style='color:#a1a1aa'>Darme de baja</a>.</p>";

    public static UnsubscribePayload? Unprotect(IDataProtectionProvider dp, string token) =>
        Token.Unprotect(dp, token, p => p.TenantId != Guid.Empty && !string.IsNullOrEmpty(p.Email));
}
