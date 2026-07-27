using System.Text.Json;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Emission;

/// <summary>
/// Emisión de comprobantes de punta a punta. El número se reserva bajo advisory
/// lock por (tenant,env,ptoVta,cbteTipo) y se reconcilia con FECompUltimoAutorizado
/// dentro del lock (H14): el próximo es exactamente último+1. Un rechazo de ARCA
/// NO consume número (el índice único sólo aplica a comprobantes autorizados), así
/// que se puede reintentar. Un fallo de transporte hace rollback: no deja hueco.
/// </summary>
public sealed class EmitInvoiceHandler(
    FiscalDbContext db,
    IFiscalGateway gateway,
    IFiscalAuthenticator authenticator,
    ILogger<EmitInvoiceHandler> logger) : IInvoiceEmitter
{
    // Zona horaria de Argentina (UTC-3, sin DST) para la fecha del comprobante.
    private static readonly TimeSpan ArOffset = TimeSpan.FromHours(-3);

    public async Task<Result<EmitInvoiceResult>> EmitAsync(EmitInvoiceCommand cmd, CancellationToken ct = default)
    {
        var cfg = await db.Configs.FirstOrDefaultAsync(c => c.TenantId == cmd.TenantId, ct);
        if (cfg is null)
            return Result.Failure<EmitInvoiceResult>(Error.Conflict("Fiscal.NotConfigured",
                "Falta configurar la facturación (datos del emisor)."));

        var cuitResult = Cuit.Create(cfg.Cuit);
        if (cuitResult.IsFailure) return Result.Failure<EmitInvoiceResult>(cuitResult.Error);
        var cuit = cuitResult.Value;
        var env = cfg.Environment;

        // Punto de venta: el pasado en el comando o el default de la config.
        var ptoVtaResult = await ResolvePointOfSaleAsync(cmd, cfg, ct);
        if (ptoVtaResult.IsFailure) return Result.Failure<EmitInvoiceResult>(ptoVtaResult.Error);
        var ptoVta = ptoVtaResult.Value;

        // Receptor + clase de comprobante (según emisor y comprador).
        var receptor = ReceptorResolver.Resolve(cmd.BuyerDoc, cmd.GrossMinorUnits, cfg.ConsumerFinalThresholdMinorUnits);
        var draftResult = ComprobanteBuilder.Build(cfg.Condition, receptor, cmd.GrossMinorUnits, cmd.CreditNote);
        if (draftResult.IsFailure) return Result.Failure<EmitInvoiceResult>(draftResult.Error);
        var draft = draftResult.Value;

        // TA de WSFEv1 (reusa cache o pide con advisory lock adentro).
        var ticketResult = await authenticator.GetTicketAsync(cmd.TenantId, cuit, "wsfe", env, ct);
        if (ticketResult.IsFailure) return Result.Failure<EmitInvoiceResult>(ticketResult.Error);
        var ticket = ticketResult.Value;

        // Numeración + emisión serializadas por (tenant,env,ptoVta,cbteTipo).
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var lockKey = LockKey(cmd.TenantId, env, ptoVta, draft.CbteTipo);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock({0})", [lockKey], ct);

        // Reconciliar con ARCA lo último autorizado (fuente de verdad, H14).
        var lastResult = await gateway.GetLastAuthorizedAsync(ticket, cuit, env, ptoVta, draft.CbteTipo, ct);
        if (lastResult.IsFailure) { await tx.RollbackAsync(ct); return Result.Failure<EmitInvoiceResult>(lastResult.Error); }

        var seq = await LoadOrCreateSequenceAsync(cmd.TenantId, env, ptoVta, draft.CbteTipo, ct);
        seq.SyncWithAuthority(lastResult.Value);
        var number = seq.Next();
        var cbteFch = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(ArOffset).DateTime);

        var caeResult = await gateway.RequestCaeAsync(ticket, cuit, env, ptoVta, number, cbteFch, draft, ct);
        if (caeResult.IsFailure)
        {
            // Fallo de transporte: no persistimos nada (no dejamos hueco de numeración).
            await tx.RollbackAsync(ct);
            return Result.Failure<EmitInvoiceResult>(caeResult.Error);
        }
        var outcome = caeResult.Value;

        var doc = FiscalDocument.Draft(
            cmd.TenantId, cmd.OrderId, env, ptoVta, draft.CbteTipo, number,
            draft.Receptor.DocTipo, draft.Receptor.DocNro, draft.ImpTotal, draft.ImpNeto, draft.ImpIVA);

        if (outcome.IsAuthorized && outcome.Cae is not null && outcome.CaeVto is not null)
        {
            doc.MarkAuthorized(outcome.Cae, outcome.CaeVto.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                Serialize(outcome.Observations), outcome.RequestXml, outcome.ResponseXml);
            db.Documents.Add(doc);
            db.Sequences.Update(seq);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            logger.LogInformation("CAE otorgado (tenant {Tenant}, {Cbte} {Pv}-{Nro}).",
                cmd.TenantId, draft.CbteTipo, ptoVta, number);
        }
        else
        {
            // Rechazo: ARCA NO consumió el número. Persistimos el intento para
            // auditoría pero revertimos el avance de la secuencia (se reintenta).
            doc.MarkRejected(Serialize(outcome.Errors), outcome.RequestXml, outcome.ResponseXml);
            db.Documents.Add(doc);
            await db.SaveChangesAsync(ct); // el índice único es parcial (sólo autorizados)
            await tx.CommitAsync(ct);
            logger.LogWarning("Comprobante rechazado por ARCA (tenant {Tenant}, {Cbte} {Pv}-{Nro}): {Err}",
                cmd.TenantId, draft.CbteTipo, ptoVta, number,
                outcome.Errors.Count > 0 ? $"{outcome.Errors[0].Code} {outcome.Errors[0].Message}" : "(sin detalle)");
        }

        return new EmitInvoiceResult(
            doc.Id, outcome.IsAuthorized, ptoVta, draft.CbteTipo.ToString(), number,
            outcome.Cae, outcome.CaeVto, outcome.Observations, outcome.Errors);
    }

    private async Task<Result<int>> ResolvePointOfSaleAsync(EmitInvoiceCommand cmd, FiscalConfig cfg, CancellationToken ct)
    {
        if (cmd.PtoVta is > 0) return cmd.PtoVta.Value;

        if (cfg.DefaultPointOfSaleId is { } posId)
        {
            var pos = await db.PointsOfSale.FirstOrDefaultAsync(p => p.Id == posId && p.Active, ct);
            if (pos is not null) return pos.Number;
        }

        // Sin default: si hay un único punto de venta activo, usarlo.
        var actives = await db.PointsOfSale.Where(p => p.Active).ToListAsync(ct);
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

    private static long LockKey(Guid tenantId, FiscalEnvironment env, int ptoVta, CbteTipo cbteTipo)
    {
        var s = $"{tenantId:N}|{(int)env}|{ptoVta}|{(int)cbteTipo}";
        ulong hash = 14695981039346656037UL;
        foreach (var c in s) { hash ^= c; hash *= 1099511628211UL; }
        return unchecked((long)hash);
    }
}
