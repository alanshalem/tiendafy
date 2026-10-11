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

    public static UnsubscribePayload? Unprotect(IDataProtectionProvider dp, string token) =>
        Token.Unprotect(dp, token, p => p.TenantId != Guid.Empty && !string.IsNullOrEmpty(p.Email));
}
