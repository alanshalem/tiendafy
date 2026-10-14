using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Fiscal;

/// <summary>
/// Si la tienda ya puede facturar: datos del emisor, un certificado activo y
/// vigente, y al menos un punto de venta. Es lo mismo que pide el emisor antes
/// de llamar a ARCA, y lo que muestra el checklist de Configuración ›
/// Facturación. Las pantallas con un botón "Facturar" lo preguntan para no
/// ofrecer algo que solo puede terminar en error.
/// </summary>
public sealed record FiscalReadiness(bool Issuer, bool Certificate, bool PointOfSale)
{
    public bool Ready => Issuer && Certificate && PointOfSale;

    public static async Task<FiscalReadiness> CheckAsync(FiscalDbContext db, Guid tenantId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return new FiscalReadiness(
            await db.Configs.AsNoTracking().AnyAsync(c => c.TenantId == tenantId, ct),
            await db.Certificates.AsNoTracking().AnyAsync(c => c.TenantId == tenantId
                && c.Status == CertificateStatus.Active && c.NotAfterUtc > now, ct),
            await db.PointsOfSale.AsNoTracking().AnyAsync(p => p.TenantId == tenantId && p.Active, ct));
    }
}
