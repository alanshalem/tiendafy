using System.Text.Json;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Emission;

/// <summary>
/// Emisión de comprobantes de punta a punta, bajo advisory lock por
/// (tenant,env,ptoVta,cbteTipo). Tres reglas, cada una con una historia:
///
/// 1. El número lo decide ARCA: exactamente FECompUltimoAutorizado + 1 (H14).
///    La secuencia local es un espejo y se pisa en las dos direcciones; si
///    alguna vez quedara adelante, ARCA rechazaría todo lo que sigue (10016).
///
/// 2. Un rechazo NO consume número. Se guarda con errores Y observaciones: con
///    Resultado "R", las observaciones son el motivo.
///
/// 3. Un timeout después de pedir el CAE NO se reintenta a ciegas. La respuesta
///    se perdió, pero ARCA pudo haber autorizado: reintentar emitiría una SEGUNDA
///    factura con CAE para la misma venta. El comprobante queda "a reconciliar"
///    con su número, y antes de emitir nada más en esa serie se le pregunta a
///    ARCA por él (FECompConsultar): si lo tiene, se adopta su CAE; si no, el
///    número quedó libre.
/// </summary>
public sealed class EmitInvoiceHandler(
    FiscalDbContext db,
    IFiscalGateway gateway,
    IFiscalAuthenticator authenticator,
    ILogger<EmitInvoiceHandler> logger) : IInvoiceEmitter
{
    private static readonly System.Globalization.CultureInfo ArCulture = System.Globalization.CultureInfo.GetCultureInfo("es-AR");

    // Zona horaria de Argentina (UTC-3, sin DST) para la fecha del comprobante.
    private static readonly TimeSpan ArOffset = TimeSpan.FromHours(-3);

    public async Task<Result<EmitInvoiceResult>> EmitAsync(EmitInvoiceCommand cmd, CancellationToken ct = default)
    {
        var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == cmd.TenantId, ct);
        if (cfg is null)
            return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.NotConfigured",
                "Falta configurar la facturación (datos del emisor)."));

        // Guarda anti-duplicado: no re-facturar una orden ya facturada (protege el
        // camino manual y el automático). No aplica a notas de crédito.
        if (!cmd.CreditNote && cmd.OrderId is { } orderId)
        {
            var already = await db.Documents.AsNoTracking().AnyAsync(
                d => d.TenantId == cmd.TenantId && d.OrderId == orderId && d.Result == FiscalResult.Authorized
                  && d.CbteTipo != CbteTipo.NotaCreditoA && d.CbteTipo != CbteTipo.NotaCreditoB && d.CbteTipo != CbteTipo.NotaCreditoC, ct);
            if (already)
                return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.AlreadyInvoiced",
                    "Esta orden ya tiene una factura autorizada."));
        }

        // Lo mismo para la nota de crédito: una segunda NC autorizada chocaría con
        // el índice único DESPUÉS de que ARCA la autorizó — CAE emitido y perdido.
        if (cmd.CreditNote && cmd.OrderId is { } creditedOrder)
        {
            var credited = await db.Documents.AsNoTracking().AnyAsync(
                d => d.TenantId == cmd.TenantId && d.OrderId == creditedOrder && d.Result == FiscalResult.Authorized
                  && (d.CbteTipo == CbteTipo.NotaCreditoA || d.CbteTipo == CbteTipo.NotaCreditoB || d.CbteTipo == CbteTipo.NotaCreditoC), ct);
            if (credited)
                return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.AlreadyCredited",
                    "Esta orden ya tiene una nota de crédito autorizada."));
        }

        var cuitResult = Cuit.Create(cfg.Cuit);
        if (cuitResult.IsFailure) return Result.Failure<EmitInvoiceResult>(cuitResult.Error);
        var cuit = cuitResult.Value;
        var env = cfg.Environment;

        // Punto de venta: el pasado en el comando o el default de la config.
        var ptoVtaResult = await ResolvePointOfSaleAsync(cmd, cfg, ct);
        if (ptoVtaResult.IsFailure) return Result.Failure<EmitInvoiceResult>(ptoVtaResult.Error);
        var ptoVta = ptoVtaResult.Value;

        // Receptor + clase de comprobante (según emisor y comprador).
        var receptor = ReceptorResolver.Resolve(cmd.BuyerDoc, cmd.BuyerIvaCondition);

        // Umbral de consumidor final (RG 5.700/2025, configurable): por encima,
        // ARCA exige identificar al comprador. El umbral se guardaba y nadie lo
        // leía: la factura salía anónima y volvía rechazada. Acá se corta antes,
        // con un mensaje que dice qué falta y sin gastar una llamada a ARCA. No
        // aplica a notas de crédito: acreditan una factura que ya pasó.
        if (!cmd.CreditNote
            && receptor.DocTipo == DocTipo.ConsumidorFinal
            && cfg.ConsumerFinalThresholdMinorUnits > 0
            && cmd.GrossMinorUnits >= cfg.ConsumerFinalThresholdMinorUnits)
        {
            return Result.Failure<EmitInvoiceResult>(Error.Validation(EmissionErrors.BuyerIdRequired,
                $"Por encima de ${(cfg.ConsumerFinalThresholdMinorUnits / 100).ToString("N0", ArCulture)} ARCA exige identificar al comprador: "
                + "cargá su DNI o CUIT al facturar."));
        }
        var draftResult = ComprobanteBuilder.Build(cfg.Condition, receptor, cmd.GrossMinorUnits, cmd.CreditNote);
        if (draftResult.IsFailure) return Result.Failure<EmitInvoiceResult>(draftResult.Error);
        var draft = draftResult.Value;

        // Nota de crédito: referencia obligatoria al comprobante original (CbtesAsoc).
        if (cmd.CreditNote)
        {
            if (cmd.OrderId is not { } oid)
                return Result.Failure<EmitInvoiceResult>(Error.Validation("Fiscal.NcNeedsOrder",
                    "Una nota de crédito necesita la orden del comprobante original."));

            var original = await db.Documents
                .Where(d => d.TenantId == cmd.TenantId && d.OrderId == oid && d.Result == FiscalResult.Authorized
                    && (d.CbteTipo == CbteTipo.FacturaA || d.CbteTipo == CbteTipo.FacturaB || d.CbteTipo == CbteTipo.FacturaC))
                .OrderByDescending(d => d.CreatedAtUtc).FirstOrDefaultAsync(ct);
            if (original is null)
                return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.NoOriginalInvoice",
                    "No hay una factura autorizada para acreditar en esta orden."));

            draft = draft with { CbtesAsoc = [new CbteAsoc(original.CbteTipo, original.PtoVta, original.Number)] };
        }

        // ARCA no deja que alguien se facture a sí mismo, y el error que devuelve
        // ("DocNro no puede ser igual al del emisor") no dice qué hacer. Pasa al
        // probar la tienda con el CUIT de la propia empresa.
        if (draft.Receptor.DocTipo == DocTipo.Cuit && draft.Receptor.DocNro == cuit.AsLong)
            return Result.Failure<EmitInvoiceResult>(Error.Validation("Fiscal.SelfInvoice",
                "El CUIT del comprador es el mismo que el de la tienda: ARCA no deja facturarse a uno mismo."));

        // TA de WSFEv1 (reusa cache o pide con advisory lock adentro).
        var ticketResult = await authenticator.GetTicketAsync(cmd.TenantId, cuit, "wsfe", env, ct);
        if (ticketResult.IsFailure) return Result.Failure<EmitInvoiceResult>(ticketResult.Error);
        var ticket = ticketResult.Value;

        // Lock de SESIÓN y no de transacción, a propósito: el comprobante se graba
        // como pendiente ANTES de pedir el CAE (write-ahead), y eso exige
        // confirmar la transacción sin soltar el lock. Si el proceso muere entre
        // el pedido y la respuesta, queda el registro para reconciliar; sin él,
        // el reintento no sabría que ese número pudo haberse usado y facturaría
        // dos veces. Si la conexión se cae, Postgres suelta el lock solo.
        var lockKey = LockKey(cmd.TenantId, env, ptoVta, draft.CbteTipo);
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_lock({0})", [lockKey], ct);
            try
            {
                return await EmitLockedAsync(cmd, cuit, env, ptoVta, draft, ticket, ct);
            }
            finally
            {
                // Sin el token del request: soltar el lock no puede cancelarse.
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_unlock({0})", [lockKey], CancellationToken.None);
            }
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    /// <summary>La emisión propiamente dicha, con el lock de la serie tomado.</summary>
    private async Task<Result<EmitInvoiceResult>> EmitLockedAsync(
        EmitInvoiceCommand cmd, Cuit cuit, FiscalEnvironment env, int ptoVta, InvoiceDraft draft,
        FiscalTicket ticket, CancellationToken ct)
    {
        // Lo último autorizado según ARCA: la única fuente de verdad (H14).
        var lastResult = await gateway.GetLastAuthorizedAsync(ticket, cuit, env, ptoVta, draft.CbteTipo, ct);
        if (lastResult.IsFailure) return Result.Failure<EmitInvoiceResult>(lastResult.Error);
        var last = lastResult.Value;

        // Antes de emitir nada: lo que quedó a medias en esta serie. Si ARCA ya
        // autorizó el comprobante de ESTA venta, se adopta y no se emite otro.
        // Sin saber qué pasó con un número pendiente, no se emite.
        var reconciled = await ReconcilePendingAsync(cmd, ticket, cuit, env, ptoVta, draft.CbteTipo, last, ct);
        await db.SaveChangesAsync(CancellationToken.None);
        if (reconciled.IsFailure) return Result.Failure<EmitInvoiceResult>(reconciled.Error);
        if (reconciled.Value is { } adopted) return adopted;

        var seq = await LoadOrCreateSequenceAsync(cmd.TenantId, env, ptoVta, draft.CbteTipo, ct);
        if (seq.SyncWithAuthority(last) && seq.LastNumber != 0)
            logger.LogWarning("Numeración local desfasada de ARCA (tenant {Tenant}, {Cbte} {Pv}): se corrige a {Last}.",
                cmd.TenantId, draft.CbteTipo, ptoVta, last);

        // Último + 1, exacto. La secuencia local recién avanza si ARCA autoriza.
        var number = last + 1;
        var cbteFch = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(ArOffset).DateTime);

        // Write-ahead: el comprobante existe, pendiente y con su número, ANTES de
        // que el pedido salga hacia ARCA.
        var doc = FiscalDocument.Draft(
            cmd.TenantId, cmd.OrderId, env, ptoVta, draft.CbteTipo, number,
            draft.Receptor.DocTipo, draft.Receptor.DocNro, draft.ImpTotal, draft.ImpNeto, draft.ImpIVA);
        doc.MarkAwaitingReconciliation(null, "Pedido de CAE enviado a ARCA; esperando respuesta.");
        db.Documents.Add(doc);
        await db.SaveChangesAsync(ct);

        var caeResult = await gateway.RequestCaeAsync(ticket, cuit, env, ptoVta, number, cbteFch, draft, ct);

        // De acá en adelante se graba sin el token del request: si el pedido ya
        // salió, lo que ARCA contestó tiene que quedar registrado aunque el
        // request se haya cancelado.
        if (caeResult.IsFailure)
        {
            if (FiscalGatewayErrors.IsAmbiguous(caeResult.Error))
            {
                // La respuesta no llegó. ARCA pudo haberlo autorizado: el número
                // queda tomado hasta preguntarle.
                doc.MarkAwaitingReconciliation(null,
                    "No llegó la respuesta de ARCA. Antes de reintentar se le pregunta si lo autorizó.");
                await db.SaveChangesAsync(CancellationToken.None);

                logger.LogWarning("Pedido de CAE sin respuesta (tenant {Tenant}, {Cbte} {Pv}-{Nro}): queda a reconciliar.",
                    cmd.TenantId, draft.CbteTipo, ptoVta, number);
                return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.AwaitingReconciliation",
                    "No llegó la respuesta de ARCA. Antes de volver a intentar se verifica con ARCA si el comprobante " +
                    "quedó autorizado, para no facturar dos veces la misma venta."));
            }

            // ARCA contestó con un fault: el pedido se procesó y se rechazó, el
            // número no se usó.
            doc.MarkRejected(Serialize([new FiscalMessage("Fault", caeResult.Error.Message)]), null, null);
            await db.SaveChangesAsync(CancellationToken.None);
            return Result.Failure<EmitInvoiceResult>(caeResult.Error);
        }
        var outcome = caeResult.Value;

        if (outcome.IsAuthorized && outcome.Cae is not null && outcome.CaeVto is not null)
        {
            doc.MarkAuthorized(outcome.Cae, outcome.CaeVto.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                Serialize(outcome.Observations), outcome.RequestXml, outcome.ResponseXml);
            seq.Next();
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogInformation("CAE otorgado (tenant {Tenant}, {Cbte} {Pv}-{Nro}).",
                cmd.TenantId, draft.CbteTipo, ptoVta, number);
        }
        else
        {
            // Rechazo: ARCA NO consumió el número y la secuencia no se movió. Se
            // guarda el intento, con errores Y observaciones, para saber por qué.
            doc.MarkRejected(Serialize(outcome.Errors), outcome.RequestXml, outcome.ResponseXml,
                Serialize(outcome.Observations));
            await db.SaveChangesAsync(CancellationToken.None);

            var reason = outcome.Errors.Concat(outcome.Observations).FirstOrDefault();
            logger.LogWarning("Comprobante rechazado por ARCA (tenant {Tenant}, {Cbte} {Pv}-{Nro}): {Err}",
                cmd.TenantId, draft.CbteTipo, ptoVta, number,
                reason is null ? "(sin detalle)" : ArcaErrorCatalog.Describe(reason.Code, reason.Message));
        }

        return new EmitInvoiceResult(
            doc.Id, outcome.IsAuthorized, ptoVta, draft.CbteTipo.ToString(), number,
            outcome.Cae, outcome.CaeVto, outcome.Observations, outcome.Errors);
    }

    /// <summary>
    /// Resuelve los comprobantes de esta serie que quedaron sin respuesta,
    /// preguntándole a ARCA por cada uno. Devuelve el de ESTA venta si ARCA lo
    /// había autorizado (y entonces no hay que emitir), o null para seguir.
    /// </summary>
    private async Task<Result<EmitInvoiceResult?>> ReconcilePendingAsync(
        EmitInvoiceCommand cmd, FiscalTicket ticket, Cuit cuit, FiscalEnvironment env,
        int ptoVta, CbteTipo cbteTipo, long arcaLast, CancellationToken ct)
    {
        var pending = await db.Documents
            .Where(d => d.TenantId == cmd.TenantId && d.Environment == env && d.PtoVta == ptoVta
                        && d.CbteTipo == cbteTipo && d.Result == FiscalResult.Pending)
            .OrderBy(d => d.Number)
            .ToListAsync(ct);

        EmitInvoiceResult? adopted = null;
        foreach (var doc in pending)
        {
            // Más allá de lo último autorizado: ARCA nunca lo registró.
            if (doc.Number > arcaLast)
            {
                doc.MarkNeverReachedArca();
                continue;
            }

            var consulted = await gateway.ConsultAsync(ticket, cuit, env, ptoVta, cbteTipo, doc.Number, ct);
            if (consulted.IsFailure) return Result.Failure<EmitInvoiceResult?>(consulted.Error);

            if (consulted.Value is not { } arca || !arca.IsAuthorized || arca.CaeVto is null)
            {
                // El número está usado (es ≤ al último) pero ARCA no devuelve un
                // comprobante autorizado legible. No se adivina: queda para
                // revisar a mano, y mientras tanto no se emite en esta serie.
                logger.LogError("Reconciliación: ARCA no confirma el {Cbte} {Pv}-{Nro} (tenant {Tenant}).",
                    cbteTipo, ptoVta, doc.Number, cmd.TenantId);
                return Result.Failure<EmitInvoiceResult?>(Error.Conflict("Fiscal.ReconcileFailed",
                    $"No se pudo confirmar con ARCA el comprobante {ptoVta:D4}-{doc.Number:D8}. " +
                    "Revisalo en ARCA antes de seguir facturando con este punto de venta."));
            }

            // Es nuestro solo si coincide lo que lo identifica: a quién y cuánto.
            if (arca.DocNro != doc.DocNro || arca.ImpTotal != doc.ImpTotal)
            {
                doc.MarkNumberTakenByAnother(arca.DocNro, arca.ImpTotal);
                logger.LogError("Reconciliación: el {Cbte} {Pv}-{Nro} de ARCA no es el nuestro (tenant {Tenant}).",
                    cbteTipo, ptoVta, doc.Number, cmd.TenantId);
                continue;
            }

            doc.MarkAuthorized(arca.Cae!, arca.CaeVto.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                null, doc.RequestPayload, "(reconciliado con FECompConsultar)");
            logger.LogInformation("Reconciliación: ARCA sí había autorizado el {Cbte} {Pv}-{Nro} (CAE {Cae}).",
                cbteTipo, ptoVta, doc.Number, arca.Cae);

            if (doc.OrderId == cmd.OrderId)
                adopted = new EmitInvoiceResult(
                    doc.Id, true, ptoVta, cbteTipo.ToString(), doc.Number,
                    arca.Cae, arca.CaeVto, [], []);
        }

        return adopted;
    }

    private async Task<Result<int>> ResolvePointOfSaleAsync(EmitInvoiceCommand cmd, FiscalConfig cfg, CancellationToken ct)
    {
        if (cmd.PtoVta is > 0) return cmd.PtoVta.Value;

        // Filtro de tenant explícito: el handler corre también sin tenant en scope
        // (worker de emisión), donde el filtro global de EF queda bypasseado.
        if (cfg.DefaultPointOfSaleId is { } posId)
        {
            var pos = await db.PointsOfSale.FirstOrDefaultAsync(p => p.TenantId == cmd.TenantId && p.Id == posId && p.Active, ct);
            if (pos is not null) return pos.Number;
        }

        // Sin default: si hay un único punto de venta activo, usarlo.
        var actives = await db.PointsOfSale.Where(p => p.TenantId == cmd.TenantId && p.Active).ToListAsync(ct);
        if (actives.Count == 1) return actives[0].Number;

        return Result.Failure<int>(Error.Validation("Fiscal.NoPointOfSale",
            "Indicá el punto de venta o configurá uno por defecto."));
    }

    private async Task<FiscalSequence> LoadOrCreateSequenceAsync(
        Guid tenantId, FiscalEnvironment env, int ptoVta, CbteTipo cbteTipo, CancellationToken ct)
    {
        var seq = await db.Sequences.FirstOrDefaultAsync(
            s => s.TenantId == tenantId && s.Environment == env && s.PtoVta == ptoVta && s.CbteTipo == cbteTipo, ct);
        if (seq is null)
        {
            seq = FiscalSequence.Create(tenantId, env, ptoVta, cbteTipo, 0);
            db.Sequences.Add(seq);
        }
        return seq;
    }

    private static string Serialize(IReadOnlyList<FiscalMessage> messages) =>
        JsonSerializer.Serialize(messages.Select(m => new { m.Code, m.Message }));

    /// <summary>Clave del lock de una serie de numeración.</summary>
    private static long LockKey(Guid tenantId, FiscalEnvironment env, int ptoVta, CbteTipo cbteTipo) =>
        AdvisoryLock.KeyFor($"{tenantId:N}|{(int)env}|{ptoVta}|{(int)cbteTipo}");
}
