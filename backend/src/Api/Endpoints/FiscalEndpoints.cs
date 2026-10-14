using Api.Auth;
using Api.Fiscal;
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

        // ¿Se puede facturar ya? Lo preguntan las pantallas que tienen un botón
        // "Facturar" (Ventas, Mercado Libre, Inicio) para no ofrecerlo cuando
        // apretarlo solo puede dar error: sin emisor, certificado activo y un
        // punto de venta, ARCA ni se llama. Sin secretos ni datos fiscales: lo
        // ve quien ve ventas, aunque no pueda tocar la configuración.
        group.MapGet("/fiscal/readiness", async (ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var r = await FiscalReadiness.CheckAsync(db, tenant.TenantId.Value, ct);
            return Results.Ok(new { ready = r.Ready, issuer = r.Issuer, certificate = r.Certificate, pointOfSale = r.PointOfSale });
        }).RequireAnyPermission(Permission.OrdersRead, Permission.MeliOperate, Permission.FiscalEmit, Permission.FiscalConfig);

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

            // Con un certificado activo para su ambiente la tienda ya puede
            // emitir: se habilita la facturación. Nadie más lo hacía, y la cola
            // exige Enabled: la factura y la nota de crédito automáticas no se
            // encolaban nunca aunque el comercio las activara.
            var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value, ct);
            if (cfg is not null && cfg.Environment == cert.Environment) cfg.Enable();

            await db.SaveChangesAsync(ct);
            return Results.Ok(CertDto(cert));
        });

        // --- Probar conexión con ARCA -------------------------------------------------
        // Diagnóstico por pasos, de lo más básico a lo más cercano a facturar. Cada
        // paso existe porque hay una falla que el anterior no ve:
        //   1. certificado activo y de quién es (el titular no siempre factura);
        //   2. WSAA entrega el ticket (certificado bien cargado y autorizado a wsfe);
        //   3. WSFEv1 acepta el CUIT que factura (el error 600 aparece acá, no en 2);
        //   4. los puntos de venta existen en ARCA como Web Services.
        // Y dice lo que NO prueba: ARCA valida más cosas al emitir que al consultar.
        fiscal.MapPost("/test-connection", async (
            ITenantContext tenant, FiscalDbContext db, IFiscalAuthenticator auth, IFiscalGateway gateway,
            IFiscalCertificateFactory factory, IFiscalSecretProtector protector, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tid, ct);
            if (cfg is null) return Error.Conflict("Fiscal.NoConfig", "Configurá primero los datos del emisor.").ToProblem();

            var cuit = Cuit.Create(cfg.Cuit);
            if (cuit.IsFailure) return cuit.Error.ToProblem();

            var steps = new List<DiagnosticStep>();
            DateTime? expiresAtUtc = null;

            // 1) Certificado
            var cert = await db.Certificates.AsNoTracking()
                .Where(c => c.TenantId == tid && c.Environment == cfg.Environment && c.Status == CertificateStatus.Active)
                .OrderByDescending(c => c.UpdatedAtUtc).FirstOrDefaultAsync(ct);
            if (cert?.CertificatePemEncrypted is null)
            {
                steps.Add(DiagnosticStep.Error("certificate", "Certificado",
                    $"No hay un certificado activo para {cfg.Environment}. Homologación y producción usan certificados distintos."));
                return Results.Ok(DiagnosticDto(cfg, steps, expiresAtUtc));
            }

            var info = factory.InspectSignedCertificate(
                protector.Unprotect(cert.CertificatePemEncrypted), protector.Unprotect(cert.PrivateKeyEncrypted));
            var holder = info.IsSuccess ? info.Value.SubjectCuit : null;
            if (holder is not null && holder != cfg.Cuit)
            {
                // No es un error —con delegación de servicio es exactamente así—,
                // pero es la causa más común del 600 y conviene decirlo antes.
                steps.Add(DiagnosticStep.Warning("certificate", "Certificado",
                    $"El certificado es del CUIT {holder} y la tienda factura como {cfg.Cuit}. Funciona solo si " +
                    $"{cfg.Cuit} le delegó el servicio de Factura Electrónica a {holder} en el Administrador de " +
                    "Relaciones de ARCA. Si no, cargá el CUIT del certificado o generá uno nuevo."));
            }
            else
            {
                steps.Add(DiagnosticStep.Ok("certificate", "Certificado",
                    cert.NotAfterUtc is { } until ? $"Vigente hasta el {until:dd/MM/yyyy}." : "Cargado."));
            }

            // 2) WSAA
            var ticket = await auth.GetTicketAsync(tid, cuit.Value, "wsfe", cfg.Environment, ct);
            if (ticket.IsFailure)
            {
                steps.Add(DiagnosticStep.Error("wsaa", "Autenticación (WSAA)", ticket.Error.Message));
                return Results.Ok(DiagnosticDto(cfg, steps, expiresAtUtc));
            }
            expiresAtUtc = ticket.Value.ExpiresAtUtc;
            steps.Add(DiagnosticStep.Ok("wsaa", "Autenticación (WSAA)",
                $"Ticket de acceso vigente hasta {ticket.Value.ExpiresAtUtc:dd/MM HH:mm} UTC."));

            // 3) WSFEv1 con el CUIT que factura. FECompUltimoAutorizado es de solo
            // lectura: no crea nada ni consume numeración.
            var points = await db.PointsOfSale.AsNoTracking()
                .Where(p => p.TenantId == tid && p.Active).OrderBy(p => p.Number).ToListAsync(ct);
            var probePos = points.FirstOrDefault()?.Number ?? 1;
            var probeType = cfg.Condition == FiscalCondition.Monotributo ? CbteTipo.FacturaC : CbteTipo.FacturaB;
            var last = await gateway.GetLastAuthorizedAsync(ticket.Value, cuit.Value, cfg.Environment, probePos, probeType, ct);
            if (last.IsFailure)
            {
                steps.Add(DiagnosticStep.Error("wsfe", "Factura electrónica (WSFEv1)", last.Error.Message));
                return Results.Ok(DiagnosticDto(cfg, steps, expiresAtUtc));
            }
            steps.Add(DiagnosticStep.Ok("wsfe", "Factura electrónica (WSFEv1)",
                $"ARCA acepta al CUIT {cfg.Cuit}. Último comprobante {probeType} del punto de venta {probePos}: {last.Value}."));

            // 4) Puntos de venta: tienen que ser de tipo Web Services. Los de
            // Comprobantes en línea o controlador fiscal no sirven, y el error que
            // da emitir con uno de esos no menciona el punto de venta.
            if (points.Count == 0)
            {
                steps.Add(DiagnosticStep.Warning("pos", "Puntos de venta",
                    "No cargaste ningún punto de venta. Creá uno en ARCA de tipo \"RECE para aplicativo y web services\" y cargá su número acá."));
            }
            else
            {
                var arcaPoints = await gateway.GetPointsOfSaleAsync(ticket.Value, cuit.Value, cfg.Environment, ct);
                if (arcaPoints.IsFailure)
                    steps.Add(DiagnosticStep.Warning("pos", "Puntos de venta",
                        $"No se pudo consultar la lista de ARCA: {arcaPoints.Error.Message}"));
                else if (arcaPoints.Value is null)
                    steps.Add(DiagnosticStep.Skipped("pos", "Puntos de venta",
                        "En homologación ARCA no lista los puntos de venta y acepta cualquier número. Se verifica en producción."));
                else
                {
                    var problems = points.Select(p =>
                    {
                        var match = arcaPoints.Value.FirstOrDefault(a => a.Number == p.Number);
                        return match switch
                        {
                            null => $"El {p.Number} ({p.Label}) no está en ARCA como punto de venta de Web Services. " +
                                    "¿Es de Comprobantes en línea o de controlador fiscal? Esos no sirven: creá uno de " +
                                    "tipo \"RECE para aplicativo y web services\".",
                            { Blocked: true } => $"El {p.Number} ({p.Label}) está bloqueado en ARCA.",
                            { Retired: true } => $"El {p.Number} ({p.Label}) está dado de baja en ARCA.",
                            _ => null,
                        };
                    }).Where(m => m is not null).ToList();

                    steps.Add(problems.Count == 0
                        ? DiagnosticStep.Ok("pos", "Puntos de venta",
                            $"{string.Join(", ", points.Select(p => p.Number))}: habilitados para Web Services.")
                        : DiagnosticStep.Error("pos", "Puntos de venta", string.Join(" ", problems)));
                }
            }

            return Results.Ok(DiagnosticDto(cfg, steps, expiresAtUtc));
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
        // Libro IVA ventas del mes en CSV (para el contador): comprobantes
        // APROBADOS con neto/IVA/total, separador ; y BOM (Excel argentino).
        fiscal.MapGet("/documents/export", async (
            int year, int month, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            if (year < 2020 || month is < 1 or > 12)
                return Error.Validation("Fiscal.BadPeriod", "Período inválido.").ToProblem();
            var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
            var to = from.AddMonths(1);

            var docs = await db.Documents.AsNoTracking()
                .Where(d => d.Result == FiscalResult.Authorized && d.CreatedAtUtc >= from && d.CreatedAtUtc < to)
                .OrderBy(d => d.PtoVta).ThenBy(d => d.Number)
                .ToListAsync(ct);

            var bytes = Api.Fiscal.VatBookCsv.Build(
                "Fecha;Tipo;Punto de venta;Numero;Doc receptor;Neto;IVA;Total;CAE",
                docs.Select(d => new[]
                {
                    Api.Fiscal.VatBookCsv.Date(d.CreatedAtUtc),
                    d.CbteTipo.ToString(),
                    d.PtoVta.ToString("0000"),
                    d.Number.ToString("00000000"),
                    d.DocNro == 0 ? "Consumidor final" : d.DocNro.ToString(),
                    Api.Fiscal.VatBookCsv.Amount(d.ImpNeto),
                    Api.Fiscal.VatBookCsv.Amount(d.ImpIVA),
                    Api.Fiscal.VatBookCsv.Amount(d.ImpTotal),
                    d.Cae ?? "",
                }));
            return Results.File(bytes, "text/csv", $"libro-iva-ventas-{year}-{month:00}.csv");
        });

        // Gateado con FiscalEmit (más restrictivo que FiscalConfig). Emite un
        // comprobante puntual desde el admin (sin orden asociada).
        var emit = group.MapGroup("/fiscal").RequirePermission(Permission.FiscalEmit);

        // Quién es un CUIT y cuál es su condición frente al IVA, según ARCA
        // (padrón A5). Es lo que permite facturar A a un Responsable Inscripto
        // persona física sin adivinar: el número solo no lo dice.
        emit.MapGet("/padron/{cuit}", async (
            string cuit, ITenantContext tenant, ITaxpayerRegistry registry, CancellationToken ct) =>
        {
            var parsed = Cuit.Create(new string([.. cuit.Where(char.IsDigit)]));
            if (parsed.IsFailure)
                return Error.Validation("Padron.BadCuit", "Ese CUIT no es válido (revisá el dígito verificador).").ToProblem();

            var result = await registry.LookupAsync(tenant.TenantId.Value, parsed.Value, ct);
            if (result.IsFailure) return result.Error.ToProblem();

            var t = result.Value;
            return Results.Ok(new
            {
                cuit = t.Cuit,
                name = t.Name,
                isCompany = t.IsCompany,
                condicion = IvaConditionWire.Write(t.Condicion),
                address = t.Address,
            });
        });

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
                r.DocumentId,
                r.Authorized,
                r.PtoVta,
                cbteTipo = r.CbteTipo,
                r.Number,
                r.Cae,
                caeVto = r.CaeVto?.ToString("yyyy-MM-dd"),
                observations = r.Observations.Select(o => new { o.Code, o.Message }),
                // Con Resultado "R" el motivo puede venir en Errors o en
                // Observaciones: se devuelven juntos y explicados, o el rechazo
                // llega al panel como "ver detalle" sin ningún detalle.
                errors = (r.Authorized ? r.Errors : r.Errors.Concat(r.Observations))
                    .Select(e => new { e.Code, Message = global::Fiscal.Core.Domain.ArcaErrorCatalog.Describe(e.Code, e.Message) }),
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

    private static object DiagnosticDto(FiscalConfig cfg, List<DiagnosticStep> steps, DateTime? expiresAtUtc) => new
    {
        ok = steps.TrueForAll(st => st.Status is "ok" or "skipped"),
        environment = cfg.Environment.ToString().ToUpperInvariant(),
        expiresAtUtc,
        steps = steps.Select(st => new { key = st.Key, label = st.Label, status = st.Status, detail = st.Detail }),
        // Lo que este diagnóstico NO puede ver. ARCA valida más al emitir que al
        // consultar: un contribuyente inhabilitado (monotributo dado de baja,
        // por ejemplo) pasa todos los pasos y falla recién al facturar.
        caveat = "Esto confirma que el certificado, la autenticación y la relación con el CUIT funcionan. No " +
                 "garantiza que ARCA deje emitir: la situación fiscal del contribuyente se valida recién al " +
                 "facturar. La primera factura real es la prueba final.",
    };

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

/// <summary>Un paso del diagnóstico de conexión con ARCA.</summary>
public sealed record DiagnosticStep(string Key, string Label, string Status, string Detail)
{
    public static DiagnosticStep Ok(string key, string label, string detail) => new(key, label, "ok", detail);
    public static DiagnosticStep Warning(string key, string label, string detail) => new(key, label, "warning", detail);
    public static DiagnosticStep Error(string key, string label, string detail) => new(key, label, "error", detail);
    public static DiagnosticStep Skipped(string key, string label, string detail) => new(key, label, "skipped", detail);
}
