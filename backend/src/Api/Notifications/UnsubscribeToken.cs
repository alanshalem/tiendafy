using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Notifications;

/// <summary>
/// Token firmado del link de baja de campañas. SIN vencimiento a propósito:
/// un link de baja tiene que funcionar aunque el email quede meses en la
/// bandeja (derecho del destinatario, y requisito de los ESP).
/// </summary>
public sealed record UnsubscribePayload(Guid TenantId, string Email);

public static class UnsubscribeToken
{
    private const string Purpose = "Tiendafy.Marketing.Unsubscribe.v1";

    public static string Protect(IDataProtectionProvider dp, Guid tenantId, string email) =>
        dp.CreateProtector(Purpose)
            .Protect(JsonSerializer.Serialize(new UnsubscribePayload(tenantId, email.Trim().ToLowerInvariant())));

    public static UnsubscribePayload? Unprotect(IDataProtectionProvider dp, string token)
    {
        try
        {
            var raw = dp.CreateProtector(Purpose).Unprotect(token);
            var payload = JsonSerializer.Deserialize<UnsubscribePayload>(raw);
            return payload is null || payload.TenantId == Guid.Empty || string.IsNullOrEmpty(payload.Email)
                ? null
                : payload;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
