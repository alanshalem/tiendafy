using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Fiscal;

/// <summary>
/// Si la tienda ya puede facturar: datos del emisor, un certificado activo y
/// vigente del ambiente en que factura, y al menos un punto de venta. Es lo
/// mismo que pide el emisor antes de llamar a ARCA, y lo que muestra el
/// checklist de Configuración › Facturación. Las pantallas con un botón
/// "Facturar" lo preguntan para no ofrecer algo que solo puede terminar en error.
///
/// <para>
/// El certificado es del ambiente actual: ARCA usa uno distinto para
/// homologación y para producción. Antes servía cualquiera, así que una tienda
/// recién pasada a producción con solo el de homologación figuraba lista y
/// "Facturar" fallaba.
/// </para>
/// </summary>
public sealed record FiscalReadiness(bool Issuer, bool Certificate, bool PointOfSale)
{
    public bool Ready => Issuer && Certificate && PointOfSale;

    public static async Task<FiscalReadiness> CheckAsync(FiscalDbContext db, Guid tenantId, CancellationToken ct)
    {
        var environment = await db.Configs.AsNoTracking().Where(c => c.TenantId == tenantId)
            .Select(c => (FiscalEnvironment?)c.Environment).FirstOrDefaultAsync(ct);
        return new FiscalReadiness(
            environment is not null,
            environment is { } env && await HasUsableCertificateAsync(db, tenantId, env, ct),
            await db.PointsOfSale.AsNoTracking().AnyAsync(p => p.TenantId == tenantId && p.Active, ct));
    }

    /// <summary>¿Hay un certificado activo y vigente para ese ambiente?</summary>
    public static Task<bool> HasUsableCertificateAsync(
        FiscalDbContext db, Guid tenantId, FiscalEnvironment environment, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return db.Certificates.AsNoTracking().AnyAsync(c => c.TenantId == tenantId && c.Environment == environment
            && c.Status == CertificateStatus.Active && c.NotAfterUtc > now, ct);
    }
}
