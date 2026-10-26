using Ai.Infrastructure;
using Api.Middleware;
using Api.Workers;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// Procesa los trabajos de fichas ([ADR 0005](../adr/0005-segundo-plano-con-polling-a-postgres.md)): una pasada cada 5
/// segundos, un trabajo por tienda, hasta <see cref="Parallelism"/> ítems a la vez. Cada ítem se reclama con un UPDATE
/// condicional sobre su fila (el mismo patrón de claim por fila que <see cref="InboxDrain"/>: con dos instancias de la
/// API no hay dos redactando el mismo producto) y se procesa en su propio scope con la tienda fijada. El reclamo vence a
/// los <see cref="Lease"/>: si la API se cae a mitad de un ítem, otra pasada lo retoma desde el último paso guardado.
///
/// <para>
/// Antes de reclamar se mira el tope del mes: si no entra un ítem en el peor caso, el trabajo queda pausado por presupuesto
/// y ningún ítem falla por eso. Un trabajo que no tiene más ítems pendientes termina en la misma pasada.
/// </para>
/// </summary>
public sealed class AiCatalogWorker(
    IServiceScopeFactory scopes,
    AiConcurrency concurrency,
    TimeProvider clock,
    ILogger<AiCatalogWorker> logger) : PollingWorker(TimeSpan.FromSeconds(5))
{
    public const int Parallelism = 3;

    /// <summary>Más que dos veces (60 s del redactor + 30 s del evaluador) con las lecturas de Mercado Libre de por medio.</summary>
    public static readonly TimeSpan Lease = TimeSpan.FromMinutes(10);

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "El worker de fichas con IA falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        List<(Guid JobId, Guid TenantId)> due;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var ai = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            // De todas las tiendas: acá no hay request, así que se ignora el filtro de tienda a propósito.
            var active = await ai.CatalogJobs.IgnoreQueryFilters().AsNoTracking()
                .Where(j => j.Status == AiCatalogJobStatus.Queued || j.Status == AiCatalogJobStatus.Running)
                .OrderBy(j => j.CreatedAtUtc)
                .Select(j => new { j.Id, j.TenantId })
                .ToListAsync(ct);
            due = [.. active.GroupBy(j => j.TenantId).Select(g => (g.First().Id, g.Key))];
        }

        foreach (var (jobId, tenantId) in due)
        {
            // Una pasada de la tienda a la vez: si todavía se está procesando la anterior, se saltea.
            using var entered = concurrency.TryEnter("catalog-job", tenantId.ToString());
            if (entered is null) continue;
            try
            {
                await RunJobAsync(jobId, tenantId, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Falló el trabajo de fichas {JobId} de la tienda {TenantId}.", jobId, tenantId);
            }
        }
    }

    private async Task RunJobAsync(Guid jobId, Guid tenantId, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var ai = sp.GetRequiredService<AiDbContext>();

        var job = await ai.CatalogJobs.IgnoreQueryFilters().FirstOrDefaultAsync(j => j.TenantId == tenantId && j.Id == jobId, ct);
        if (job is null || job.Status is not (AiCatalogJobStatus.Queued or AiCatalogJobStatus.Running)) return;
        if (job.Status == AiCatalogJobStatus.Queued)
        {
            job.Start(Now);
            await ai.SaveChangesAsync(ct);
        }

        if (await BudgetBlockAsync(sp, tenantId, ct) is { } block)
        {
            await MutateAsync(ai, tenantId, jobId, j => { if (block == AiCatalogJobStatus.PausedBudget) j.PauseForBudget(Now); else j.PauseUnavailable(Now); }, ct);
            return;
        }

        var claimed = await ClaimAsync(ai, tenantId, jobId, ct);
        if (claimed.Count == 0)
        {
            await FinishIfDoneAsync(ai, tenantId, jobId, ct);
            return;
        }

        var outcomes = await Task.WhenAll(claimed.Select(itemId => ProcessOneAsync(tenantId, itemId, ct)));

        var processed = outcomes.Count(o => o is AiCatalogItemOutcome.Review or AiCatalogItemOutcome.NeedsCategory or AiCatalogItemOutcome.Failed);
        if (processed > 0)
        {
            await ai.CatalogJobs.IgnoreQueryFilters().Where(j => j.TenantId == tenantId && j.Id == jobId)
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.Processed, j => j.Processed + processed), ct);
        }

        if (outcomes.Contains(AiCatalogItemOutcome.PausedBudget))
            await MutateAsync(ai, tenantId, jobId, j => j.PauseForBudget(Now), ct);
        else if (outcomes.Contains(AiCatalogItemOutcome.PausedUnavailable))
            await MutateAsync(ai, tenantId, jobId, j => j.PauseUnavailable(Now), ct);
        else
            await FinishIfDoneAsync(ai, tenantId, jobId, ct);
    }

    /// <summary>
    /// Si no entra un ítem en el peor caso dentro del tope del mes: <c>PausedBudget</c>. Si la tienda ya no tiene redactor o evaluador:
    /// <c>PausedUnavailable</c>. Null = se puede seguir.
    /// </summary>
    private static async Task<AiCatalogJobStatus?> BudgetBlockAsync(IServiceProvider sp, Guid tenantId, CancellationToken ct)
    {
        var snapshot = await sp.GetRequiredService<IAiTenantConfig>().LoadAsync(tenantId, ct);
        if (AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogWrite) is not { } write
            || AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogJudge) is not { } judge)
            return AiCatalogJobStatus.PausedUnavailable;

        var committed = await sp.GetRequiredService<AiBudget>().CommittedMicroUsdAsync(tenantId, ct);
        return committed + AiCatalogEstimate.WorstCaseItemMicroUsd(write, judge) > snapshot.MonthlyBudgetMicroUsd
            ? AiCatalogJobStatus.PausedBudget
            : null;
    }

    /// <summary>
    /// Hasta <see cref="Parallelism"/> ítems pendientes sin reclamo vigente. Cada uno se reclama con un UPDATE condicional
    /// (si otra instancia llegó antes, no afecta ninguna fila).
    /// </summary>
    private async Task<List<Guid>> ClaimAsync(AiDbContext ai, Guid tenantId, Guid jobId, CancellationToken ct)
    {
        var now = Now;
        var staleBefore = now - Lease;
        var candidates = await ai.CatalogJobItems.IgnoreQueryFilters().AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.JobId == jobId && i.Status == AiCatalogItemStatus.Pending
                && (i.ClaimedAtUtc == null || i.ClaimedAtUtc < staleBefore))
            .OrderBy(i => i.UpdatedAtUtc).ThenBy(i => i.Id)
            .Select(i => i.Id)
            .Take(Parallelism)
            .ToListAsync(ct);

        var claimed = new List<Guid>(candidates.Count);
        foreach (var id in candidates)
        {
            var rows = await ai.CatalogJobItems.IgnoreQueryFilters()
                .Where(i => i.Id == id && i.TenantId == tenantId && i.Status == AiCatalogItemStatus.Pending
                    && (i.ClaimedAtUtc == null || i.ClaimedAtUtc < staleBefore))
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.ClaimedAtUtc, now), ct);
            if (rows == 1) claimed.Add(id);
        }
        return claimed;
    }

    /// <summary>Cada ítem en su scope, con la tienda del ítem fijada antes de resolver nada que lea la base.</summary>
    private async Task<AiCatalogItemOutcome> ProcessOneAsync(Guid tenantId, Guid itemId, CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(tenantId));
            return await scope.ServiceProvider.GetRequiredService<AiCatalogItemProcessor>().ProcessAsync(itemId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // El reclamo vence solo (Lease) y el ítem se retoma; mientras tanto no frena a los demás.
            logger.LogError(ex, "Falló el ítem {ItemId} de la tienda {TenantId}.", itemId, tenantId);
            return AiCatalogItemOutcome.Requeued;
        }
    }

    /// <summary>Sin ítems pendientes (ni reclamados vigentes) el trabajo terminó. Los que esperan categoría o revisión no cuentan.</summary>
    private async Task FinishIfDoneAsync(AiDbContext ai, Guid tenantId, Guid jobId, CancellationToken ct)
    {
        var pending = await ai.CatalogJobItems.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(i => i.TenantId == tenantId && i.JobId == jobId && i.Status == AiCatalogItemStatus.Pending, ct);
        if (!pending) await MutateAsync(ai, tenantId, jobId, j => j.Finish(Now), ct);
    }

    /// <summary>
    /// Cambia el estado del trabajo sobre la fila de ahora: la API pudo cancelarlo o reanudarlo mientras se procesaba. Si la
    /// transición ya no es válida, el estado nuevo manda y no se toca.
    /// </summary>
    private static async Task MutateAsync(AiDbContext ai, Guid tenantId, Guid jobId, Action<AiCatalogJob> change, CancellationToken ct)
    {
        // Se suelta lo que el contexto tenía leído: una consulta no refresca una entidad ya seguida.
        ai.ChangeTracker.Clear();
        var job = await ai.CatalogJobs.IgnoreQueryFilters().FirstAsync(j => j.TenantId == tenantId && j.Id == jobId, ct);
        try
        {
            change(job);
            await ai.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException)
        {
            ai.ChangeTracker.Clear();
        }
    }

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
