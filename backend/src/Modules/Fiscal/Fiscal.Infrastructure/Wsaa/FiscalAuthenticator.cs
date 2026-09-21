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
/// toma un advisory lock de Postgres para que dos workers no pidan TA a la vez,
/// firma el TRA con el certificado del tenant, llama a loginCms y persiste el TA
/// cifrado.
///
/// La regla que manda todo esto: WSAA NO entrega un TA nuevo mientras el anterior
/// siga vigente (coe.alreadyAuthenticated), y un TA dura hasta 12 horas. Perder el
/// que tenemos —o descartarlo antes de tiempo— deja a la tienda sin poder facturar
/// hasta que venza. Por eso:
///   · el TA se guarda en la base, no en memoria (sobrevive reinicios y deploys);
///   · se usa hasta su vencimiento real, con un margen de minutos y no de horas;
///   · si igual WSAA contesta alreadyAuthenticated, se vuelve al que tenemos;
///   · se busca por certificado (tenant + servicio + ambiente), NO por CUIT: el
///     TA es del certificado, y corregir el CUIT en la configuración no puede
///     disparar un login nuevo que ARCA va a rechazar.
/// </summary>
public sealed class FiscalAuthenticator(
    FiscalDbContext db,
    WsaaClient wsaa,
    IFiscalSecretProtector protector,
    IOptions<FiscalEndpointsOptions> endpoints,
    ILogger<FiscalAuthenticator> logger) : IFiscalAuthenticator
{
    // Margen corto a propósito. Con 10 minutos, el TA se daba por vencido cuando
    // ARCA todavía lo consideraba vigente, el login nuevo rebotaba con
    // alreadyAuthenticated y la tienda quedaba 10 minutos sin poder facturar.
    private static readonly TimeSpan Margin = TimeSpan.FromMinutes(2);

    public async Task<Result<FiscalTicket>> GetTicketAsync(
        Guid tenantId, Cuit cuit, string service, FiscalEnvironment environment, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        // 1) Caché caliente (fuera de lock): la mayoría de las llamadas caen acá.
        var cached = await FindValidAsync(tenantId, service, environment, now, Margin, ct);
        if (cached is not null) return Ticket(cached);

        // 2) Cache miss: serializar con advisory lock para no pedir dos TA a la vez.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var lockKey = LockKey(tenantId, cuit.Value, service, environment);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock({0})", [lockKey], ct);

        // Doble-check dentro del lock: otro proceso pudo haberlo renovado.
        var recheck = await FindValidAsync(tenantId, service, environment, DateTime.UtcNow, Margin, ct);
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
        if (login.IsFailure)
        {
            await tx.RollbackAsync(ct);

            // ARCA dice que ya tenemos uno vigente. Si lo tenemos guardado y no
            // venció de verdad (estaba dentro del margen), sirve: se usa ese.
            if (login.Error.Code == WsaaClient.AlreadyAuthenticatedCode)
            {
                var stillValid = await FindValidAsync(tenantId, service, environment, DateTime.UtcNow, TimeSpan.Zero, ct);
                if (stillValid is not null)
                {
                    logger.LogInformation(
                        "WSAA: alreadyAuthenticated; se reusa el TA guardado (tenant {TenantId}, vence {Exp}).",
                        tenantId, stillValid.ExpirationTimeUtc);
                    return Ticket(stillValid);
                }
            }

            return Result.Failure<FiscalTicket>(login.Error);
        }

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

    private async Task<FiscalAccessToken?> FindValidAsync(
        Guid tenantId, string service, FiscalEnvironment env, DateTime now, TimeSpan margin, CancellationToken ct)
    {
        // El más nuevo de la tienda para ese servicio y ambiente, sea cual sea el
        // CUIT con que se pidió: el ticket lo emite ARCA para el certificado.
        var ta = await db.AccessTokens
            .Where(t => t.TenantId == tenantId && t.Service == service && t.Environment == env)
            .OrderByDescending(t => t.ExpirationTimeUtc)
            .FirstOrDefaultAsync(ct);
        return ta is not null && ta.IsValid(now, margin) ? ta : null;
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
    private static long LockKey(Guid tenantId, string cuit, string service, FiscalEnvironment env) =>
        AdvisoryLock.KeyFor($"{tenantId:N}|{cuit}|{service}|{(int)env}");
}
