using Api.Auth;
using Api.Finance;
using Finance.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Tesorería y cuentas corrientes.
///
/// Dos cosas que el sistema no sabía y que se preguntan todos los días: dónde
/// está la plata (cajas y bancos) y quién le debe a quién (clientes y
/// proveedores). Se construyeron juntas porque son las dos caras del mismo
/// hecho: cuando se cobra una factura, baja el saldo del cliente Y entra plata
/// a una caja. Separadas, cada movimiento habría que cargarlo dos veces.
/// </summary>
public static class FinanceEndpoints
{
    public static RouteGroupBuilder MapFinanceEndpoints(this RouteGroupBuilder group)
    {
        var finance = group.MapGroup("/finance").RequireTenant().RequirePermission(Permission.Finance);

        // ---- Cuentas (cajas y bancos) ---------------------------------------

        finance.MapGet("/accounts", async (ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tid)
                .OrderBy(a => a.Kind).ThenBy(a => a.Name).ToListAsync(ct);

            // Saldo de todas las cuentas en una sola consulta: con una por
            // cuenta, el listado hace N+1 apenas hay cuatro cajas.
            var sums = await db.Movements.AsNoTracking().Where(m => m.TenantId == tid)
                .GroupBy(m => m.AccountId)
                .Select(g => new
                {
                    AccountId = g.Key,
                    In = g.Where(m => m.Kind == AccountMovementKind.In).Sum(m => (long?)m.AmountMinor) ?? 0,
                    Out = g.Where(m => m.Kind == AccountMovementKind.Out).Sum(m => (long?)m.AmountMinor) ?? 0,
                })
                .ToDictionaryAsync(x => x.AccountId, x => x.In - x.Out, ct);

            var items = accounts.Select(a => new
            {
                id = a.Id,
                name = a.Name,
                kind = a.Kind.ToString().ToLowerInvariant(),
                currency = a.Currency,
                detail = a.Detail,
                active = a.Active,
                balanceMinor = a.OpeningBalanceMinor + sums.GetValueOrDefault(a.Id),
            });

            return Results.Ok(new
            {
                items,
                // Totales por moneda: sumar pesos con dólares no significa nada.
                totals = items.Where(i => i.active)
                    .GroupBy(i => i.currency)
                    .Select(g => new { currency = g.Key, balanceMinor = g.Sum(x => x.balanceMinor) }),
            });
        });

        finance.MapPost("/accounts", async (
            AccountRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var kind = ParseAccountKind(req.Kind);
            var created = FinancialAccount.Create(
                tenant.TenantId.Value, req.Name, kind, req.Currency, req.OpeningBalanceMinor ?? 0, req.Detail);
            if (created.IsFailure) return created.Error.ToProblem();

            db.Accounts.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/accounts/{created.Value.Id}", new { id = created.Value.Id });
        });

        finance.MapPatch("/accounts/{id:guid}", async (
            Guid id, AccountRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tid, ct);
            if (account is null) return Results.NotFound();

            var updated = account.Update(req.Name, req.Detail, req.Active ?? true);
            if (updated.IsFailure) return updated.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---- Movimientos de caja --------------------------------------------

        finance.MapGet("/movements", async (
            ITenantContext tenant, FinanceDbContext db, CancellationToken ct,
            Guid? accountId = null, int limit = 50, int offset = 0) =>
        {
            var tid = tenant.TenantId.Value;
            var query = db.Movements.AsNoTracking().Where(m => m.TenantId == tid);
            if (accountId is { } a) query = query.Where(m => m.AccountId == a);

            var (rows, total) = await query
                .OrderByDescending(m => m.OccurredAtUtc).ThenByDescending(m => m.CreatedAtUtc)
                .PageAsync(offset, limit, ct);

            var names = await db.Accounts.AsNoTracking().Where(x => x.TenantId == tid)
                .ToDictionaryAsync(x => x.Id, x => x.Name, ct);

            return Results.Ok(new
            {
                total,
                items = rows.Select(m => new
                {
                    id = m.Id,
                    accountId = m.AccountId,
                    accountName = names.GetValueOrDefault(m.AccountId, "—"),
                    occurredAtUtc = m.OccurredAtUtc,
                    kind = m.Kind.ToString().ToLowerInvariant(),
                    amountMinor = m.AmountMinor,
                    currency = m.Currency,
                    concept = m.Concept,
                    reference = m.Reference,
                    receiptId = m.ReceiptId,
                    transferGroupId = m.TransferGroupId,
                }),
            });
        });

        // Movimiento suelto: un gasto, un aporte, un ajuste de caja.
        finance.MapPost("/movements", async (
            MovementRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.AccountId && a.TenantId == tid, ct);
            if (account is null) return Results.NotFound();

            var kind = req.Kind?.ToLowerInvariant() == "out" ? AccountMovementKind.Out : AccountMovementKind.In;
            var movement = AccountMovement.Create(
                tid, account.Id, kind, req.AmountMinor, account.Currency, req.Concept, req.OccurredAtUtc, req.Reference);
            if (movement.IsFailure) return movement.Error.ToProblem();

            db.Movements.Add(movement.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/movements/{movement.Value.Id}", new { id = movement.Value.Id });
        });

        // Transferencia entre cuentas propias: dos movimientos hermanos. No es
        // ingreso ni egreso de la empresa, así que tiene que quedar identificada
        // como una sola cosa o infla los totales de entradas y salidas.
        finance.MapPost("/transfers", async (
            TransferRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            if (req.FromAccountId == req.ToAccountId)
                return Results.Problem(title: "Finance.SameAccount", detail: "Elegí dos cuentas distintas.", statusCode: 400);

            var from = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.FromAccountId && a.TenantId == tid, ct);
            var to = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.ToAccountId && a.TenantId == tid, ct);
            if (from is null || to is null) return Results.NotFound();

            // Entre monedas distintas hace falta un tipo de cambio y eso es otra
            // conversación: mejor negarse que inventar una equivalencia.
            if (from.Currency != to.Currency)
                return Results.Problem(
                    title: "Finance.CurrencyMismatch",
                    detail: "Las dos cuentas tienen que ser de la misma moneda.", statusCode: 400);

            var groupId = Guid.NewGuid();
            var concept = string.IsNullOrWhiteSpace(req.Concept) ? $"Transferencia {from.Name} → {to.Name}" : req.Concept!.Trim();

            var outMove = AccountMovement.Create(tid, from.Id, AccountMovementKind.Out, req.AmountMinor, from.Currency,
                concept, req.OccurredAtUtc, transferGroupId: groupId);
            if (outMove.IsFailure) return outMove.Error.ToProblem();

            var inMove = AccountMovement.Create(tid, to.Id, AccountMovementKind.In, req.AmountMinor, to.Currency,
                concept, req.OccurredAtUtc, transferGroupId: groupId);
            if (inMove.IsFailure) return inMove.Error.ToProblem();

            db.Movements.AddRange(outMove.Value, inMove.Value);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { transferGroupId = groupId });
        });

        // ---- Cuenta corriente ------------------------------------------------

        // Saldos de todos: la pantalla de "quién me debe".
        finance.MapGet("/balances", async (
            ITenantContext tenant, FinanceDbContext db, PartyDirectory parties, CancellationToken ct,
            string partyKind = "customer") =>
        {
            var tid = tenant.TenantId.Value;
            var kind = ParsePartyKind(partyKind);

            var rows = await db.LedgerEntries.AsNoTracking()
                .Where(l => l.TenantId == tid && l.PartyKind == kind)
                .GroupBy(l => new { l.PartyId, l.Currency })
                .Select(g => new
                {
                    partyId = g.Key.PartyId,
                    currency = g.Key.Currency,
                    debit = g.Where(l => l.Kind == LedgerEntryKind.Debit).Sum(l => (long?)l.AmountMinor) ?? 0,
                    credit = g.Where(l => l.Kind == LedgerEntryKind.Credit).Sum(l => (long?)l.AmountMinor) ?? 0,
                    lastAtUtc = g.Max(l => l.OccurredAtUtc),
                })
                .ToListAsync(ct);

            var items = rows
                .Select(r => new { r.partyId, r.currency, balanceMinor = r.debit - r.credit, r.lastAtUtc })
                .Where(r => r.balanceMinor != 0)
                .OrderByDescending(r => Math.Abs(r.balanceMinor))
                .ToList();

            // El nombre vive en el módulo del contacto, no acá: una lista de
            // GUID con saldo no se puede leer.
            var names = await parties.NamesAsync(tid, kind, items.Select(i => i.partyId).ToList(), ct);

            return Results.Ok(new
            {
                items = items.Select(i => new
                {
                    i.partyId,
                    partyName = names.GetValueOrDefault(i.partyId, "(sin nombre)"),
                    i.currency,
                    i.balanceMinor,
                    i.lastAtUtc,
                }),
                totalMinor = items.Sum(i => i.balanceMinor),
            });
        });

        // Buscador de contactos para elegir a quién cobrarle o pagarle. Devuelve
        // clientes o proveedores según de qué lado se esté mirando.
        finance.MapGet("/parties", async (
            ITenantContext tenant, PartyDirectory parties, CancellationToken ct,
            string partyKind = "customer", string? q = null) =>
            Results.Ok(new { items = await parties.SearchAsync(tenant.TenantId.Value, ParsePartyKind(partyKind), q, ct) }));

        // Estado de cuenta de uno: movimientos con saldo acumulado.
        finance.MapGet("/ledger", async (
            ITenantContext tenant, FinanceDbContext db, PartyDirectory parties, CancellationToken ct,
            string partyKind = "customer", Guid? partyId = null) =>
        {
            if (partyId is not { } party || party == Guid.Empty) return Results.BadRequest(new { error = "Falta el cliente o proveedor." });

            var tid = tenant.TenantId.Value;
            var kind = ParsePartyKind(partyKind);

            var entries = await db.LedgerEntries.AsNoTracking()
                .Where(l => l.TenantId == tid && l.PartyKind == kind && l.PartyId == party)
                .OrderBy(l => l.OccurredAtUtc).ThenBy(l => l.CreatedAtUtc)
                .ToListAsync(ct);

            long running = 0;
            var items = entries.Select(e =>
            {
                running += e.SignedAmountMinor;
                return new
                {
                    id = e.Id,
                    occurredAtUtc = e.OccurredAtUtc,
                    docType = e.DocType.ToString().ToLowerInvariant(),
                    docLabel = e.DocLabel,
                    docId = e.DocId,
                    debitMinor = e.Kind == LedgerEntryKind.Debit ? e.AmountMinor : 0,
                    creditMinor = e.Kind == LedgerEntryKind.Credit ? e.AmountMinor : 0,
                    pendingMinor = e.Kind == LedgerEntryKind.Debit ? e.PendingMinor : 0,
                    balanceMinor = running,
                    currency = e.Currency,
                    notes = e.Notes,
                };
            }).ToList();

            return Results.Ok(new
            {
                partyId = party,
                partyName = await parties.NameAsync(tid, kind, party, ct) ?? "(sin nombre)",
                balanceMinor = running,
                currency = entries.FirstOrDefault()?.Currency ?? "ARS",
                items,
            });
        });

        // Comprobantes con saldo pendiente: lo que se le ofrece imputar a un cobro.
        finance.MapGet("/ledger/pending", async (
            ITenantContext tenant, FinanceDbContext db, CancellationToken ct,
            string partyKind = "customer", Guid? partyId = null) =>
        {
            if (partyId is not { } party || party == Guid.Empty) return Results.BadRequest(new { error = "Falta el cliente o proveedor." });

            var tid = tenant.TenantId.Value;
            var kind = ParsePartyKind(partyKind);

            // Lo pendiente de un cliente son sus DÉBITOS impagos; lo pendiente
            // con un proveedor son sus créditos (sus facturas). Se pide siempre
            // "lo que queda por saldar", mire quien mire.
            var side = kind == PartyKind.Customer ? LedgerEntryKind.Debit : LedgerEntryKind.Credit;

            var rows = await db.LedgerEntries.AsNoTracking()
                .Where(l => l.TenantId == tid && l.PartyKind == kind && l.PartyId == party
                            && l.Kind == side && l.SettledMinor < l.AmountMinor)
                .OrderBy(l => l.OccurredAtUtc)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                items = rows.Select(l => new
                {
                    id = l.Id,
                    occurredAtUtc = l.OccurredAtUtc,
                    docLabel = l.DocLabel,
                    amountMinor = l.AmountMinor,
                    settledMinor = l.SettledMinor,
                    pendingMinor = l.PendingMinor,
                    currency = l.Currency,
                }),
            });
        });

        // Ajuste manual: la única forma de tocar una cuenta corriente a mano, y
        // queda como un movimiento más, con motivo.
        finance.MapPost("/ledger/adjustments", async (
            AdjustmentRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var kind = ParsePartyKind(req.PartyKind);
            var entryKind = req.Kind?.ToLowerInvariant() == "credit" ? LedgerEntryKind.Credit : LedgerEntryKind.Debit;

            var entry = LedgerEntry.Create(
                tid, kind, req.PartyId, entryKind, req.AmountMinor, req.Currency ?? "ARS",
                LedgerDocType.Adjustment,
                req.Label ?? "Ajuste", null, req.OccurredAtUtc, req.Reason);
            if (entry.IsFailure) return entry.Error.ToProblem();

            db.LedgerEntries.Add(entry.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/ledger/{entry.Value.Id}", new { id = entry.Value.Id });
        });

        // ---- Recibos ---------------------------------------------------------

        finance.MapGet("/receipts", async (
            ITenantContext tenant, FinanceDbContext db, CancellationToken ct,
            string? kind = null, int limit = 50, int offset = 0) =>
        {
            var tid = tenant.TenantId.Value;
            var query = db.Receipts.AsNoTracking().Where(r => r.TenantId == tid);
            if (kind is not null)
                query = query.Where(r => r.Kind == (kind.ToLowerInvariant() == "payment" ? ReceiptKind.Payment : ReceiptKind.Collection));

            var (rows, total) = await query
                .OrderByDescending(r => r.OccurredAtUtc).ThenByDescending(r => r.CreatedAtUtc)
                .PageAsync(offset, limit, ct);

            return Results.Ok(new
            {
                total,
                items = rows.Select(r => new
                {
                    id = r.Id,
                    number = r.Number,
                    kind = r.Kind.ToString().ToLowerInvariant(),
                    partyKind = r.PartyKind.ToString().ToLowerInvariant(),
                    partyId = r.PartyId,
                    partyName = r.PartyName,
                    occurredAtUtc = r.OccurredAtUtc,
                    totalMinor = r.TotalMinor,
                    currency = r.Currency,
                    voided = r.Voided,
                    notes = r.Notes,
                }),
            });
        });

        finance.MapPost("/receipts", async (
            ReceiptRequest req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var receiptKind = req.Kind?.ToLowerInvariant() == "payment" ? ReceiptKind.Payment : ReceiptKind.Collection;
            var partyKind = ParsePartyKind(req.PartyKind);

            var payments = (req.Payments ?? []).Select(p => (p.AccountId, p.AmountMinor)).ToList();
            var allocations = (req.Allocations ?? []).Select(a => (a.LedgerEntryId, a.AmountMinor)).ToList();

            // Las cuentas tienen que ser de esta tienda y de la misma moneda que
            // el recibo: si no, el saldo de la caja termina siendo una mezcla.
            var accountIds = payments.Select(p => p.AccountId).Distinct().ToList();
            var accounts = await db.Accounts.AsNoTracking()
                .Where(a => a.TenantId == tid && accountIds.Contains(a.Id)).ToListAsync(ct);
            if (accounts.Count != accountIds.Count)
                return Results.Problem(title: "Finance.UnknownAccount", detail: "Alguna cuenta no existe.", statusCode: 400);

            var currency = accounts.Select(a => a.Currency).Distinct().ToList();
            if (currency.Count != 1)
                return Results.Problem(
                    title: "Finance.CurrencyMismatch",
                    detail: "Todas las cuentas del recibo tienen que ser de la misma moneda.", statusCode: 400);

            var number = await NextNumberAsync(db, tid, receiptKind, ct);
            var created = Receipt.Create(
                tid, receiptKind, number, partyKind, req.PartyId, req.PartyName, currency[0],
                req.OccurredAtUtc, req.Notes, payments, allocations);
            if (created.IsFailure) return created.Error.ToProblem();
            var receipt = created.Value;

            // Imputar: baja el pendiente de cada comprobante elegido.
            if (allocations.Count > 0)
            {
                var ids = allocations.Select(a => a.LedgerEntryId).ToList();
                var targets = await db.LedgerEntries
                    .Where(l => l.TenantId == tid && ids.Contains(l.Id) && l.PartyId == req.PartyId)
                    .ToListAsync(ct);
                if (targets.Count != ids.Count)
                    return Results.Problem(
                        title: "Finance.UnknownEntry",
                        detail: "Algún comprobante a imputar no existe o no es de este contacto.", statusCode: 400);

                foreach (var (entryId, amount) in allocations)
                {
                    var settled = targets.First(t => t.Id == entryId).Settle(amount);
                    if (settled.IsFailure) return settled.Error.ToProblem();
                }
            }

            // La contrapartida en la cuenta corriente. Un cobro es Haber del
            // cliente (le baja lo que debe); un pago es Debe del proveedor.
            var entryKind = receiptKind == ReceiptKind.Collection ? LedgerEntryKind.Credit : LedgerEntryKind.Debit;
            var ledger = LedgerEntry.Create(
                tid, partyKind, req.PartyId, entryKind, receipt.TotalMinor, currency[0],
                receiptKind == ReceiptKind.Collection ? LedgerDocType.Receipt : LedgerDocType.Payment,
                receipt.Number, receipt.Id, receipt.OccurredAtUtc, req.Notes);
            if (ledger.IsFailure) return ledger.Error.ToProblem();

            // Y la plata: entra en un cobro, sale en un pago.
            var movementKind = receiptKind == ReceiptKind.Collection ? AccountMovementKind.In : AccountMovementKind.Out;
            foreach (var payment in receipt.Payments)
            {
                var movement = AccountMovement.Create(
                    tid, payment.AccountId, movementKind, payment.AmountMinor, currency[0],
                    $"{(receiptKind == ReceiptKind.Collection ? "Cobro" : "Pago")} {receipt.Number} · {receipt.PartyName}",
                    receipt.OccurredAtUtc, receipt.Number, receiptId: receipt.Id);
                if (movement.IsFailure) return movement.Error.ToProblem();
                db.Movements.Add(movement.Value);
            }

            db.Receipts.Add(receipt);
            db.LedgerEntries.Add(ledger.Value);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/finance/receipts/{receipt.Id}", new { id = receipt.Id, number = receipt.Number });
        });

        // Anular: revierte las tres cosas que hizo el recibo (plata, saldo e
        // imputaciones) o no revierte ninguna.
        finance.MapPost("/receipts/{id:guid}/void", async (
            Guid id, VoidRequest? req, ITenantContext tenant, FinanceDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var receipt = await db.Receipts.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tid, ct);
            if (receipt is null) return Results.NotFound();

            var voided = receipt.Void(req?.Reason);
            if (voided.IsFailure) return voided.Error.ToProblem();

            foreach (var allocation in receipt.Allocations)
            {
                var entry = await db.LedgerEntries.FirstOrDefaultAsync(l => l.Id == allocation.LedgerEntryId && l.TenantId == tid, ct);
                entry?.Unsettle(allocation.AmountMinor);
            }

            // Los movimientos de caja no se borran: se contra-asientan, para que
            // el arqueo de ayer siga dando lo que dio.
            var movements = await db.Movements.Where(m => m.TenantId == tid && m.ReceiptId == receipt.Id).ToListAsync(ct);
            foreach (var m in movements.Where(m => m.TransferGroupId is null))
            {
                var reverse = AccountMovement.Create(
                    tid, m.AccountId,
                    m.Kind == AccountMovementKind.In ? AccountMovementKind.Out : AccountMovementKind.In,
                    m.AmountMinor, m.Currency, $"Anulación {receipt.Number}", DateTime.UtcNow, receipt.Number);
                if (reverse.IsSuccess) db.Movements.Add(reverse.Value);
            }

            var reversal = LedgerEntry.Create(
                tid, receipt.PartyKind, receipt.PartyId,
                receipt.Kind == ReceiptKind.Collection ? LedgerEntryKind.Debit : LedgerEntryKind.Credit,
                receipt.TotalMinor, receipt.Currency, LedgerDocType.Adjustment,
                $"Anulación {receipt.Number}", receipt.Id, DateTime.UtcNow, req?.Reason);
            if (reversal.IsSuccess) db.LedgerEntries.Add(reversal.Value);

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    /// <summary>
    /// Numerador por tienda y tipo. Con el índice único de (tenant, tipo,
    /// número) detrás: si dos recibos salen en el mismo instante, el segundo
    /// falla y se reintenta, en vez de repetir número en silencio.
    /// </summary>
    private static async Task<string> NextNumberAsync(FinanceDbContext db, Guid tenantId, ReceiptKind kind, CancellationToken ct)
    {
        var prefix = kind == ReceiptKind.Collection ? "REC" : "OP";
        var count = await db.Receipts.CountAsync(r => r.TenantId == tenantId && r.Kind == kind, ct);
        return $"{prefix}-{count + 1:D4}";
    }

    private static FinancialAccountKind ParseAccountKind(string? value) =>
        value?.ToLowerInvariant() == "bank" ? FinancialAccountKind.Bank : FinancialAccountKind.Cash;

    private static PartyKind ParsePartyKind(string? value) =>
        value?.ToLowerInvariant() == "supplier" ? PartyKind.Supplier : PartyKind.Customer;
}

public sealed record AccountRequest(
    string? Name, string? Kind, string? Currency, long? OpeningBalanceMinor, string? Detail, bool? Active);

public sealed record MovementRequest(
    Guid AccountId, string? Kind, long AmountMinor, string? Concept, DateTime? OccurredAtUtc, string? Reference);

public sealed record TransferRequest(
    Guid FromAccountId, Guid ToAccountId, long AmountMinor, string? Concept, DateTime? OccurredAtUtc);

public sealed record AdjustmentRequest(
    string? PartyKind, Guid PartyId, string? Kind, long AmountMinor, string? Currency,
    string? Label, string? Reason, DateTime? OccurredAtUtc);

public sealed record ReceiptPaymentRequest(Guid AccountId, long AmountMinor);

public sealed record ReceiptAllocationRequest(Guid LedgerEntryId, long AmountMinor);

public sealed record ReceiptRequest(
    string? Kind, string? PartyKind, Guid PartyId, string? PartyName, DateTime? OccurredAtUtc, string? Notes,
    IReadOnlyList<ReceiptPaymentRequest>? Payments, IReadOnlyList<ReceiptAllocationRequest>? Allocations);

public sealed record VoidRequest(string? Reason);
