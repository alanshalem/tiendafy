using Fiscal.Contracts;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Wsaa;

/// <summary>
/// Orquesta la obtención del TA: reusa el cacheado si sigue vigente (H4); si no,
/// toma un advisory lock de Postgres por (tenant,cuit,service,env) para que dos
/// workers no pidan TA a la vez (dispararía coe.alreadyAuthenticated), firma el
/// TRA con el certificado del tenant, llama a loginCms y persiste el TA cifrado.
/// </summary>
public sealed class FiscalAuthenticator(
    FiscalDbContext db,
    WsaaClient wsaa,
    IFiscalSecretProtector protector,
    IOptions<FiscalEndpointsOptions> endpoints,
    ILogger<FiscalAuthenticator> logger) : IFiscalAuthenticator
{
    // Margen: reusar el TA hasta 10 min antes de su vencimiento real.
    private static readonly TimeSpan Margin = TimeSpan.FromMinutes(10);

    public async Task<Result<FiscalTicket>> GetTicketAsync(
        Guid tenantId, Cuit cuit, string service, FiscalEnvironment environment, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        // 1) Caché caliente (fuera de lock): la mayoría de las llamadas caen acá.
        var cached = await FindValidAsync(tenantId, cuit.Value, service, environment, now, ct);
        if (cached is not null) return Ticket(cached);

        // 2) Cache miss: serializar con advisory lock para no pedir dos TA a la vez.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var lockKey = LockKey(tenantId, cuit.Value, service, environment);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock({0})", [lockKey], ct);

        // Doble-check dentro del lock: otro proceso pudo haberlo renovado.
        var recheck = await FindValidAsync(tenantId, cuit.Value, service, environment, DateTime.UtcNow, ct);
        if (recheck is not null) { await tx.CommitAsync(ct); return Ticket(recheck); }

        // 3) Certificado activo del tenant para este ambiente.
        var cert = await db.Certificates
            .Where(c => c.TenantId == tenantId && c.Environment == environment && c.Status == CertificateStatus.Active)
            .OrderByDescending(c => c.UpdatedAtUtc).FirstOrDefaultAsync(ct);
        if (cert is null || cert.CertificatePemEncrypted is null)
        {
            await tx.RollbackAsync(ct);
            return Result.Failure<FiscalTicket>(Error.Conflict("Fiscal.NoCertificate",
                "No hay un certificado activo para este ambiente. Completá el paso del certificado."));
        }

        var certPem = protector.Unprotect(cert.CertificatePemEncrypted);
        var keyPem = protector.Unprotect(cert.PrivateKeyEncrypted);

        string cms;
        try
        {
            using var x509 = TraSigner.LoadForSigning(certPem, keyPem);
            var tra = TraSigner.BuildTra(service, DateTimeOffset.UtcNow);
            cms = TraSigner.SignCms(tra, x509);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            logger.LogError(ex, "No se pudo firmar el TRA (tenant {TenantId}).", tenantId);
            return Result.Failure<FiscalTicket>(Error.Conflict("Fiscal.SignFailed",
                "No se pudo firmar la solicitud con el certificado. Verificá que el certificado esté bien cargado."));
        }

        var login = await wsaa.LoginCmsAsync(endpoints.Value.Wsaa(environment), cms, ct);
        if (login.IsFailure) { await tx.RollbackAsync(ct); return Result.Failure<FiscalTicket>(login.Error); }

        var creds = login.Value;
        await UpsertAsync(tenantId, cuit.Value, service, environment,
            protector.Protect(creds.Token), protector.Protect(creds.Sign),
            DateTime.UtcNow, creds.ExpirationTime.UtcDateTime, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("TA de ARCA obtenido (tenant {TenantId}, service {Service}, vence {Exp}).",
            tenantId, service, creds.ExpirationTime);
        return new FiscalTicket(creds.Token, creds.Sign, creds.ExpirationTime.UtcDateTime);
    }

    private async Task<FiscalAccessToken?> FindValidAsync(Guid tenantId, string cuit, string service, FiscalEnvironment env, DateTime now, CancellationToken ct)
    {
        var ta = await db.AccessTokens.FirstOrDefaultAsync(
            t => t.TenantId == tenantId && t.Cuit == cuit && t.Service == service && t.Environment == env, ct);
        return ta is not null && ta.IsValid(now, Margin) ? ta : null;
    }

    private async Task UpsertAsync(Guid tenantId, string cuit, string service, FiscalEnvironment env,
        string tokenEnc, string signEnc, DateTime gen, DateTime exp, CancellationToken ct)
    {
        var existing = await db.AccessTokens.FirstOrDefaultAsync(
            t => t.TenantId == tenantId && t.Cuit == cuit && t.Service == service && t.Environment == env, ct);
        if (existing is null)
            db.AccessTokens.Add(FiscalAccessToken.Create(tenantId, cuit, service, env, tokenEnc, signEnc, gen, exp));
        else
            existing.Replace(tokenEnc, signEnc, gen, exp);
    }

    private FiscalTicket Ticket(FiscalAccessToken ta) =>
        new(protector.Unprotect(ta.TokenEncrypted), protector.Unprotect(ta.SignEncrypted), ta.ExpirationTimeUtc);

    /// <summary>Clave estable (bigint) para el advisory lock por combinación lógica.</summary>
    private static long LockKey(Guid tenantId, string cuit, string service, FiscalEnvironment env)
    {
        // Hash determinístico → long (FNV-1a de 64 bits sobre la clave lógica).
        var s = $"{tenantId:N}|{cuit}|{service}|{(int)env}";
        ulong hash = 14695981039346656037UL;
        foreach (var c in s) { hash ^= c; hash *= 1099511628211UL; }
        return unchecked((long)hash);
    }
}
