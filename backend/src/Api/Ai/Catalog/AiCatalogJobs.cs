using Ai.Infrastructure;
using Api.Meli;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// Previsualizar, crear y leer los trabajos de fichas. Scoped, dentro de un request: la tienda es la del request.
/// El worker de fichas es quien los procesa.
/// </summary>
public sealed class AiCatalogJobs(
    AiDbContext ai,
    AiCatalogSelection selection,
    IAiGateway gateway,
    IAiTenantConfig config,
    AiBudget budget,
    MeliCatalogReader reader,
    ITenantContext tenant,
    UserManager<AppUser> users,
    TimeProvider clock)
{
    public const string NotConnectedReason =
        "Conectá tu cuenta de Mercado Libre: las fichas se completan con los atributos de su categoría.";

    public const string BudgetPauseReason = "Se alcanzó el tope mensual de IA. Subilo o esperá al mes que viene y reanudá.";

    private const string UnknownName = "Alguien del equipo";

    private static readonly AiCatalogItemStatus[] AllItemStatuses = Enum.GetValues<AiCatalogItemStatus>();

    private static readonly AiCatalogJobStatus[] ActiveStatuses =
        [AiCatalogJobStatus.Queued, AiCatalogJobStatus.Running, AiCatalogJobStatus.PausedBudget, AiCatalogJobStatus.PausedUnavailable];

    private Guid TenantId => tenant.TenantId.Value;

    public async Task<Result<AiCatalogPreviewDto>> PreviewAsync(AiCatalogSelectionRequest request, CancellationToken ct)
    {
        var selected = await selection.ResolveAsync(tenant.TenantId, request, ct);
        if (selected.IsFailure) return Result.Failure<AiCatalogPreviewDto>(selected.Error);
        return (await QuoteAsync(selected.Value, ct)).Preview;
    }

    public async Task<Result<AiCatalogJob>> CreateAsync(AiCatalogSelectionRequest request, Guid userId, CancellationToken ct)
    {
        var selected = await selection.ResolveAsync(tenant.TenantId, request, ct);
        if (selected.IsFailure) return Result.Failure<AiCatalogJob>(selected.Error);

        var quote = await QuoteAsync(selected.Value, ct);
        if (quote.Blocked is { } blocked) return Result.Failure<AiCatalogJob>(blocked);

        if (await ai.CatalogJobs.AnyAsync(j => j.TenantId == TenantId && ActiveStatuses.Contains(j.Status), ct))
            return Result.Failure<AiCatalogJob>(Error.Conflict(
                "AiCatalog.JobActive", "Ya hay un trabajo de fichas en curso en esta tienda."));

        var now = clock.GetUtcNow().UtcDateTime;
        var job = AiCatalogJob.Create(TenantId, userId, selected.Value.ProductIds.Count, quote.Preview.EstimatedCostMicroUsd, now);
        ai.CatalogJobs.Add(job);
        ai.CatalogJobItems.AddRange(selected.Value.ProductIds.Select(id => AiCatalogJobItem.Create(TenantId, job.Id, id, now)));
        await ai.SaveChangesAsync(ct);
        return job;
    }

    public async Task<IReadOnlyList<AiCatalogJobDto>> ListAsync(CancellationToken ct)
    {
        var jobs = await ai.CatalogJobs.AsNoTracking()
            .Where(j => j.TenantId == TenantId)
            .OrderByDescending(j => j.CreatedAtUtc).Take(20)
            .ToListAsync(ct);
        var dtos = new List<AiCatalogJobDto>(jobs.Count);
        foreach (var job in jobs) dtos.Add(await ToDtoAsync(job, ct));
        return dtos;
    }

    /// <summary>El trabajo de esta tienda (null si no existe o es de otra).</summary>
    public async Task<AiCatalogJobDto?> GetAsync(Guid jobId, CancellationToken ct)
    {
        var job = await ai.CatalogJobs.AsNoTracking().FirstOrDefaultAsync(j => j.TenantId == TenantId && j.Id == jobId, ct);
        return job is null ? null : await ToDtoAsync(job, ct);
    }

    /// <summary>Por qué la IA o Mercado Libre no se pueden usar ahora (null = se puede). Es lo que frena crear y reanudar.</summary>
    public async Task<Error?> BlockedAsync(CancellationToken ct)
    {
        var availability = await gateway.AvailabilityAsync(ct);
        foreach (var task in new[] { AiTask.CatalogWrite, AiTask.CatalogJudge })
        {
            var found = availability.FirstOrDefault(a => a.Task == task);
            if (found is null || !found.Available)
                return Error.Conflict(found?.Code ?? "Ai.TaskNotConfigured", found?.Reason ?? "Elegí un modelo para esta tarea en Configuración → Inteligencia artificial.");
        }
        return await reader.HasRealConnectionAsync(TenantId, ct)
            ? null
            : Error.Conflict("Meli.NotConnected", NotConnectedReason);
    }

    private sealed record Quote(AiCatalogPreviewDto Preview, Error? Blocked);

    private async Task<Quote> QuoteAsync(AiCatalogSelected selected, CancellationToken ct)
    {
        var snapshot = await config.LoadAsync(TenantId, ct);
        var write = AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogWrite);
        var judge = AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogJudge);
        var blocked = await BlockedAsync(ct);

        var estimated = write is not null && judge is not null
            ? selected.ProductIds.Count * AiCatalogEstimate.PerProductMicroUsd(write, judge)
            : 0;
        var committed = await budget.CommittedMicroUsdAsync(TenantId, ct);
        var remaining = Math.Max(0, snapshot.MonthlyBudgetMicroUsd - committed);

        return new Quote(new AiCatalogPreviewDto(
            selected.ProductIds.Count, selected.Matched, selected.Capped,
            estimated, snapshot.MonthlyBudgetMicroUsd, committed, remaining, estimated <= remaining,
            write?.Label, judge?.Label, blocked is null, blocked?.Message), blocked);
    }

    /// <summary>
    /// Reanuda un trabajo pausado. Se rechaza (con el motivo) si la IA o Mercado Libre siguen sin estar listos, o si lo que falta
    /// del tope del mes no alcanza para un ítem: volver a correr solo lo pausaría de nuevo.
    /// </summary>
    public async Task<Result<AiCatalogJobDto>> ResumeAsync(Guid jobId, CancellationToken ct)
    {
        var job = await ai.CatalogJobs.FirstOrDefaultAsync(j => j.TenantId == TenantId && j.Id == jobId, ct);
        if (job is null) return Result.Failure<AiCatalogJobDto>(AiCatalogEndpoints.JobNotFound);
        if (job.Status is not (AiCatalogJobStatus.PausedBudget or AiCatalogJobStatus.PausedUnavailable))
            return Result.Failure<AiCatalogJobDto>(Error.Conflict("AiCatalog.NotPaused", "El trabajo no está pausado."));

        if (await BlockedAsync(ct) is { } blocked) return Result.Failure<AiCatalogJobDto>(blocked);

        var snapshot = await config.LoadAsync(TenantId, ct);
        if (AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogWrite) is { } write
            && AiCatalogEstimate.ModelOf(snapshot, AiTask.CatalogJudge) is { } judge
            && await budget.CommittedMicroUsdAsync(TenantId, ct) + AiCatalogEstimate.WorstCaseItemMicroUsd(write, judge) > snapshot.MonthlyBudgetMicroUsd)
            return Result.Failure<AiCatalogJobDto>(AiErrors.Budget);

        job.Resume(clock.GetUtcNow().UtcDateTime);
        await ai.SaveChangesAsync(ct);
        return (await GetAsync(jobId, ct))!;
    }

    /// <summary>Cancela un trabajo activo. Lo que ya se redactó queda a la vista; lo que falta no se procesa.</summary>
    public async Task<Result<AiCatalogJobDto>> CancelAsync(Guid jobId, CancellationToken ct)
    {
        var job = await ai.CatalogJobs.FirstOrDefaultAsync(j => j.TenantId == TenantId && j.Id == jobId, ct);
        if (job is null) return Result.Failure<AiCatalogJobDto>(AiCatalogEndpoints.JobNotFound);
        if (!job.IsActive)
            return Result.Failure<AiCatalogJobDto>(Error.Conflict("AiCatalog.NotActive", "El trabajo ya terminó o está cancelado."));

        job.Cancel(clock.GetUtcNow().UtcDateTime);
        await ai.SaveChangesAsync(ct);
        return (await GetAsync(jobId, ct))!;
    }

    private async Task<AiCatalogJobDto> ToDtoAsync(AiCatalogJob job, CancellationToken ct)
    {
        var counts = await ai.CatalogJobItems.AsNoTracking()
            .Where(i => i.TenantId == TenantId && i.JobId == job.Id)
            .GroupBy(i => i.Status)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, ct);
        var byStatus = AllItemStatuses.ToDictionary(s => s.ToString(), s => counts.GetValueOrDefault(s));

        var name = await users.Users.AsNoTracking().Where(u => u.Id == job.CreatedBy).Select(u => u.DisplayName).FirstOrDefaultAsync(ct);
        return new AiCatalogJobDto(
            job.Id, job.Status.ToString(), job.Total, job.Processed, byStatus,
            job.EstimatedCostMicroUsd, job.ActualCostMicroUsd, await PauseReasonAsync(job, ct),
            job.CreatedAtUtc, string.IsNullOrWhiteSpace(name) ? UnknownName : name);
    }

    /// <summary>Se calcula al leer (no se guarda): el motivo de una pausa puede arreglarse sin tocar el trabajo.</summary>
    private async Task<string?> PauseReasonAsync(AiCatalogJob job, CancellationToken ct) => job.Status switch
    {
        AiCatalogJobStatus.PausedBudget => BudgetPauseReason,
        AiCatalogJobStatus.PausedUnavailable =>
            (await BlockedAsync(ct))?.Message ?? "La inteligencia artificial o Mercado Libre no estaban disponibles. Ya podés reanudar.",
        _ => null,
    };
}
