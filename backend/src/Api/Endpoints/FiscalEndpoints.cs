using Api.Auth;
using Fiscal.Contracts;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Configuración fiscal de la tienda + wizard de certificado (ARCA). El merchant
/// no toca OpenSSL: el sistema genera el par de claves + CSR, el merchant lo sube
/// a ARCA, descarga el certificado y lo re-sube acá. Claves/cert nunca salen por
/// API. Todo gateado con el permiso FiscalConfig (owner/admin/finanzas).
/// </summary>
public static class FiscalEndpoints
{
    public static RouteGroupBuilder MapFiscalEndpoints(this RouteGroupBuilder group)
    {
        var fiscal = group.MapGroup("/fiscal").RequirePermission(Permission.FiscalConfig);

        // --- Configuración del emisor -------------------------------------------------
        fiscal.MapGet("/config", async (ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            var cert = await db.Certificates.AsNoTracking()
                .Where(c => c.TenantId == tenant.TenantId.Value)
                .OrderByDescending(c => c.CreatedAtUtc).FirstOrDefaultAsync(ct);
            return Results.Ok(ConfigDto(cfg, cert));
        });

        // Alta/edición del emisor: CUIT (validado), razón social, condición, ambiente.
        fiscal.MapPut("/config", async (
            FiscalConfigRequest req, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var cuit = Cuit.Create(req.Cuit);
            if (cuit.IsFailure) return cuit.Error.ToProblem();
            if (string.IsNullOrWhiteSpace(req.BusinessName))
                return Error.Validation("Fiscal.NoName", "Falta la razón social.").ToProblem();
            var condition = ParseCondition(req.Condition);
            var environment = ParseEnvironment(req.Environment);

            var tid = tenant.TenantId.Value;
            var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == tid, ct);
            if (cfg is null)
            {
                cfg = FiscalConfig.Create(tid, cuit.Value, req.BusinessName, condition, environment);
                db.Configs.Add(cfg);
            }
            else
            {
                cfg.UpdateIdentity(cuit.Value, req.BusinessName, condition, environment);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(ConfigDto(cfg, null));
        });

        // Preferencias de emisión (auto, trigger, punto de venta por defecto, umbral CF).
        fiscal.MapPut("/config/emission", async (
            FiscalEmissionRequest req, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            if (cfg is null) return Error.Conflict("Fiscal.NoConfig", "Configurá primero los datos del emisor.").ToProblem();
            var trigger = string.Equals(req.Trigger, "FULFILLMENT", StringComparison.OrdinalIgnoreCase)
                ? EmissionTrigger.OnFulfillment : EmissionTrigger.OnPayment;
            cfg.SetEmissionPreferences(req.AutoInvoice, trigger, req.DefaultPointOfSaleId,
                req.ConsumerFinalThresholdMinorUnits ?? 0);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ConfigDto(cfg, null));
        });

        // --- Wizard de certificado ----------------------------------------------------
        // Paso 1: generar el par de claves + CSR. Devuelve el CSR (texto PEM) para
        // que el merchant lo suba a ARCA. La clave privada queda cifrada en la DB.
        fiscal.MapPost("/certificate/csr", async (
            GenerateCsrAdminRequest req, ITenantContext tenant, FiscalDbContext db,
            IFiscalCertificateFactory factory, IFiscalSecretProtector protector, CancellationToken ct) =>
        {
            var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            if (cfg is null) return Error.Conflict("Fiscal.NoConfig", "Configurá primero los datos del emisor (CUIT y razón social).").ToProblem();

            var alias = string.IsNullOrWhiteSpace(req.Alias)
                ? $"tiendafy-{cfg.Environment.ToString().ToLowerInvariant()}"
                : req.Alias.Trim();
            var csr = factory.GenerateKeyAndCsr(new GenerateCsrRequest(cfg.Cuit, cfg.BusinessName, alias));

            // Reemplazamos cualquier certificado pendiente previo del mismo ambiente.
            var previous = await db.Certificates
                .Where(c => c.TenantId == cfg.TenantId && c.Environment == cfg.Environment && c.Status == CertificateStatus.PendingCsr)
                .ToListAsync(ct);
            db.Certificates.RemoveRange(previous);

            var cert = FiscalCertificate.CreatePending(cfg.TenantId, cfg.Environment, protector.Protect(csr.PrivateKeyPem), csr.CsrPem);
            db.Certificates.Add(cert);
            await db.SaveChangesAsync(ct);

            // El CSR NO es secreto (es la parte pública): se puede devolver para descargar.
            return Results.Ok(new { certificateId = cert.Id, csrPem = csr.CsrPem, alias });
        });

        // Paso 2: el merchant sube el certificado firmado que descargó de ARCA (.pem/.crt).
        fiscal.MapPost("/certificate/activate", async (
            ActivateCertRequest req, ITenantContext tenant, FiscalDbContext db,
            IFiscalCertificateFactory factory, IFiscalSecretProtector protector, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.CertificatePem))
                return Error.Validation("Fiscal.NoCert", "Pegá o subí el certificado que descargaste de ARCA.").ToProblem();

            var cert = await db.Certificates.FirstOrDefaultAsync(
                c => c.TenantId == tenant.TenantId.Value && c.Id == req.CertificateId, ct);
            if (cert is null) return Results.NotFound();

            var privateKeyPem = protector.Unprotect(cert.PrivateKeyEncrypted);
            var info = factory.InspectSignedCertificate(req.CertificatePem, privateKeyPem);
            if (info.IsFailure) return info.Error.ToProblem();

            cert.Activate(protector.Protect(req.CertificatePem), info.Value.SubjectCn, info.Value.NotBeforeUtc, info.Value.NotAfterUtc);
            await db.SaveChangesAsync(ct);
            return Results.Ok(CertDto(cert));
        });

        // --- Probar conexión con ARCA -------------------------------------------------
        // Autentica contra WSAA (pide un TA) con el cert cargado. Sirve para que el
        // merchant valide que el certificado quedó bien y que ARCA le responde,
        // antes de intentar facturar. No emite nada.
        fiscal.MapPost("/test-connection", async (
            ITenantContext tenant, FiscalDbContext db, IFiscalAuthenticator auth, CancellationToken ct) =>
        {
            var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            if (cfg is null) return Error.Conflict("Fiscal.NoConfig", "Configurá primero los datos del emisor.").ToProblem();

            var cuit = Cuit.Create(cfg.Cuit);
            if (cuit.IsFailure) return cuit.Error.ToProblem();

            var ticket = await auth.GetTicketAsync(tenant.TenantId.Value, cuit.Value, "wsfe", cfg.Environment, ct);
            return ticket.IsSuccess
                ? Results.Ok(new { ok = true, expiresAtUtc = ticket.Value.ExpiresAtUtc, environment = cfg.Environment.ToString().ToUpperInvariant() })
                : ticket.Error.ToProblem();
        });

        // Chequeo de salud de WSFEv1 (FEDummy, no autenticado): ¿ARCA está arriba?
        fiscal.MapPost("/health", async (
            ITenantContext tenant, FiscalDbContext db, IFiscalGateway gateway, CancellationToken ct) =>
        {
            var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            var env = cfg?.Environment ?? FiscalEnvironment.Homologacion;
            var health = await gateway.CheckHealthAsync(env, ct);
            return health.IsSuccess
                ? Results.Ok(new { ok = health.Value.AllOk, app = health.Value.AppOk, db = health.Value.DbOk, auth = health.Value.AuthOk, environment = env.ToString().ToUpperInvariant() })
                : health.Error.ToProblem();
        });

        // --- Emisión manual -----------------------------------------------------------
        // Gateado con FiscalEmit (más restrictivo que FiscalConfig). Emite un
        // comprobante puntual desde el admin (sin orden asociada).
        var emit = group.MapGroup("/fiscal").RequirePermission(Permission.FiscalEmit);

        // Reintento manual de un job en dead-letter (o pendiente): vuelve a la cola.
        emit.MapPost("/jobs/{jobId:guid}/retry", async (
            Guid jobId, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var job = await db.EmissionJobs.FirstOrDefaultAsync(j => j.TenantId == tenant.TenantId.Value && j.Id == jobId, ct);
            if (job is null) return Results.NotFound();
            job.Requeue();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { job.Id, status = job.Status.ToString() });
        });
        emit.MapPost("/emit", async (
            EmitRequest req, ITenantContext tenant, IInvoiceEmitter emitter, CancellationToken ct) =>
        {
            if (req.Amount <= 0) return Error.Validation("Fiscal.BadAmount", "El importe debe ser mayor a cero.").ToProblem();
            var minor = (long)Math.Round(req.Amount * 100m, MidpointRounding.AwayFromZero);
            var cmd = new EmitInvoiceCommand(tenant.TenantId.Value, OrderId: null, minor,
                BuyerDoc: string.IsNullOrWhiteSpace(req.BuyerDoc) ? null : req.BuyerDoc,
                PtoVta: req.PtoVta, CreditNote: req.CreditNote);
            var result = await emitter.EmitAsync(cmd, ct);
            if (result.IsFailure) return result.Error.ToProblem();
            var r = result.Value;
            return Results.Ok(new
            {
                r.DocumentId, r.Authorized, r.PtoVta, cbteTipo = r.CbteTipo, r.Number, r.Cae,
                caeVto = r.CaeVto?.ToString("yyyy-MM-dd"),
                observations = r.Observations.Select(o => new { o.Code, o.Message }),
                errors = r.Errors.Select(e => new { e.Code, e.Message }),
            });
        });

        // --- Puntos de venta ----------------------------------------------------------
        fiscal.MapGet("/points-of-sale", async (ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var items = await db.PointsOfSale.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId.Value).OrderBy(p => p.Number).ToListAsync(ct);
            return Results.Ok(new { items = items.Select(p => new { p.Id, p.Number, p.Label, p.Active }) });
        });

        fiscal.MapPost("/points-of-sale", async (
            PointOfSaleRequest req, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            if (req.Number <= 0) return Error.Validation("Fiscal.BadPos", "El número de punto de venta debe ser mayor a 0.").ToProblem();
            var pos = FiscalPointOfSale.Create(tenant.TenantId.Value, req.Number, req.Label ?? $"Punto {req.Number}");
            db.PointsOfSale.Add(pos);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { pos.Id, pos.Number, pos.Label, pos.Active });
        });

        fiscal.MapDelete("/points-of-sale/{id:guid}", async (
            Guid id, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            await db.PointsOfSale.Where(p => p.TenantId == tenant.TenantId.Value && p.Id == id).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static FiscalCondition ParseCondition(string? v) =>
        string.Equals(v, "MONOTRIBUTO", StringComparison.OrdinalIgnoreCase)
            ? FiscalCondition.Monotributo : FiscalCondition.ResponsableInscripto;

    private static FiscalEnvironment ParseEnvironment(string? v) =>
        string.Equals(v, "PRODUCCION", StringComparison.OrdinalIgnoreCase)
            ? FiscalEnvironment.Produccion : FiscalEnvironment.Homologacion;

    // Nunca devuelve secretos (clave privada / cert cifrado).
    private static object ConfigDto(FiscalConfig? cfg, FiscalCertificate? cert) => new
    {
        configured = cfg is not null,
        cuit = cfg?.Cuit,
        businessName = cfg?.BusinessName,
        condition = cfg?.Condition.ToString().ToUpperInvariant(),
        environment = cfg?.Environment.ToString().ToUpperInvariant(),
        autoInvoice = cfg?.AutoInvoiceEnabled ?? false,
        trigger = cfg?.Trigger.ToString().ToUpperInvariant(),
        defaultPointOfSaleId = cfg?.DefaultPointOfSaleId,
        consumerFinalThresholdMinorUnits = cfg?.ConsumerFinalThresholdMinorUnits,
        enabled = cfg?.Enabled ?? false,
        certificate = cert is null ? null : CertDto(cert),
    };

    private static object CertDto(FiscalCertificate c) => new
    {
        id = c.Id,
        status = c.Status.ToString().ToUpperInvariant(),
        environment = c.Environment.ToString().ToUpperInvariant(),
        subjectCn = c.SubjectCn,
        notAfterUtc = c.NotAfterUtc,
        usable = c.IsUsable,
    };
}

public sealed record FiscalConfigRequest(string? Cuit, string? BusinessName, string? Condition, string? Environment);
public sealed record FiscalEmissionRequest(bool AutoInvoice, string? Trigger, Guid? DefaultPointOfSaleId, long? ConsumerFinalThresholdMinorUnits);
public sealed record GenerateCsrAdminRequest(string? Alias);
public sealed record ActivateCertRequest(Guid CertificateId, string? CertificatePem);
public sealed record PointOfSaleRequest(int Number, string? Label);
public sealed record EmitRequest(decimal Amount, string? BuyerDoc, int? PtoVta, bool CreditNote);
