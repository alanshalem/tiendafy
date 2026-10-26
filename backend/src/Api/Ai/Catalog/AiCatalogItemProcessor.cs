using System.Net;
using Ai.Infrastructure;
using Api.Meli;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

public enum AiCatalogItemOutcome { Review, NeedsCategory, Failed, Requeued, PausedBudget, PausedUnavailable, MeliBusy }

/// <summary>
/// Procesa UN ítem del trabajo de fichas, de la categoría de ML a la ficha lista para revisar, guardando el estado al
/// terminar cada paso (<see cref="AiCatalogJobItem.Checkpoint"/>): si la API se reinicia a mitad de un ítem, el próximo
/// reclamo retoma donde quedó sin repetir una llamada ya pagada. Corre en un scope propio con la tienda del ítem fijada
/// (cada ítem su scope: los DbContext no son thread-safe), y toda consulta de dominio filtra por esa tienda.
/// </summary>
public sealed class AiCatalogItemProcessor(
    AiDbContext ai,
    CatalogDbContext catalog,
    MeliDbContext meli,
    IProductRepository products,
    MeliCatalogReader reader,
    MeliCategoryResolver resolver,
    AiCatalogDrafter drafter,
    ITenantContext tenant,
    TimeProvider clock,
    ILogger<AiCatalogItemProcessor> logger)
{
    /// <summary>A la cuarta falla pasajera el ítem falla (o, con una redacción ya paga, queda para revisar a mano).</summary>
    public const int MaxTransientFailures = 4;

    /// <summary>Lo que espera un ítem antes de volver a probar, según cuántas fallas pasajeras lleva: 1, 5 y 15 minutos.</summary>
    public static readonly TimeSpan[] RetryWaits = [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15)];

    private const string JudgeDownNote = "El evaluador no respondió: la ficha no se pudo controlar, revisala con cuidado.";

    private Guid TenantId => tenant.TenantId.Value;

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    /// <summary>Lo que se va cambiando mientras se procesa un ítem.</summary>
    private sealed class Work(AiCatalogJobItem item, AiCatalogItemState state)
    {
        public AiCatalogJobItem Item { get; } = item;
        public AiCatalogItemState State { get; set; } = state;
    }

    public async Task<AiCatalogItemOutcome> ProcessAsync(Guid itemId, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.FirstOrDefaultAsync(i => i.TenantId == TenantId && i.Id == itemId, ct);
        if (item is null || item.Status != AiCatalogItemStatus.Pending) return AiCatalogItemOutcome.Requeued;

        // Entre el reclamo y acá el trabajo puede haberse cancelado o pausado: no se gasta nada.
        var job = await ai.CatalogJobs.AsNoTracking().FirstOrDefaultAsync(j => j.TenantId == TenantId && j.Id == item.JobId, ct);
        if (job is null || job.Status != AiCatalogJobStatus.Running) return await ReleaseAsync(item, AiCatalogItemOutcome.Requeued, ct);

        var work = new Work(item, AiCatalogItemState.FromJson(item.ProposalJson));
        try
        {
            return await RunAsync(work, job, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Un bug o una falla inesperada de un ítem no puede repetirse cada 5 segundos para siempre ni frenar a los demás.
            logger.LogError(ex, "Falló la ficha del ítem {ItemId} de la tienda {TenantId}.", itemId, TenantId);
            return await TransientAsync(work, "No se pudo armar la ficha de este producto.", ct);
        }
    }

    private async Task<AiCatalogItemOutcome> RunAsync(Work work, AiCatalogJob job, CancellationToken ct)
    {
        var product = await products.GetByIdAsync(tenant.TenantId, work.Item.ProductId, ct);
        if (product is null) return await FailAsync(work, "El producto ya no existe.", ct);

        var data = await BuildDataAsync(product, ct);

        if (work.State.Step == AiCatalogStep.Category && await CategoryStepAsync(work, product, data, ct) is { } early)
            return early;

        var input = new AiCatalogDraftInput(data, TenantId, job.CreatedBy);
        while (work.State.Step is AiCatalogStep.Write or AiCatalogStep.Judge)
        {
            if (!await IsRunningAsync(job.Id, ct)) return await ReleaseAsync(work.Item, AiCatalogItemOutcome.Requeued, ct);

            var step = await drafter.StepAsync(work.State, work.Item.Attempts, input, ct);
            if (step.IsFailure) return await GatewayErrorAsync(work, step.Error, ct);

            await AddCostAsync(job.Id, work.State, step.Value.State, ct);
            work.State = step.Value.State;
            work.Item.Checkpoint(work.State.ToJson(), step.Value.Attempts, Now);
            await ai.SaveChangesAsync(ct);
        }

        return await FinishAsync(work, ct);
    }

    /// <summary>
    /// La categoría de ML y los atributos que pide, sin IA. Null = seguir con la redacción; si no, cómo terminó el ítem.
    /// </summary>
    private async Task<AiCatalogItemOutcome?> CategoryStepAsync(
        Work work, Product product, AiCatalogProductData data, CancellationToken ct)
    {
        var connection = await reader.ConnectAsync(TenantId, ct);
        if (connection is null) return await ReleaseAsync(work.Item, AiCatalogItemOutcome.PausedUnavailable, ct);

        try
        {
            // La categoría que eligió una persona en la revisión no se vuelve a adivinar.
            MeliCategoryResolution resolution = work.State is { Category: { } chosen, CategorySource: MeliCategorySource.Manual }
                ? new MeliCategoryResolution.Resolved(chosen, MeliCategorySource.Manual)
                : await resolver.ResolveAsync(connection, product.Id, product.Name, ct);
            if (resolution is MeliCategoryResolution.Unclear unclear)
            {
                work.State = work.State with { Suggestions = unclear.Suggestions };
                work.Item.ToNeedsCategory(work.State.ToJson(), Now);
                await ai.SaveChangesAsync(ct);
                return AiCatalogItemOutcome.NeedsCategory;
            }

            var resolved = (MeliCategoryResolution.Resolved)resolution;
            var attributes = await reader.AttributesAsync(connection, resolved.Category.Id, ct);
            work.State = work.State with
            {
                Step = AiCatalogStep.Write,
                Category = resolved.Category,
                CategorySource = resolved.Source,
                Suggestions = [],
                Asked = MeliAttributeSelection.ToAsk(attributes, data.FilledMeliAttributeIds()),
            };
            work.Item.Checkpoint(work.State.ToJson(), work.Item.Attempts, Now);
            await ai.SaveChangesAsync(ct);
            return null;
        }
        catch (MeliBusyException)
        {
            // ML limita: no es culpa del ítem. Sin intento ni falla, se retoma en la próxima pasada.
            return await ReleaseAsync(work.Item, AiCatalogItemOutcome.MeliBusy, ct);
        }
        catch (MeliException ex) when (ex.Status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            logger.LogWarning("Mercado Libre rechazó la conexión de la tienda {TenantId} ({Status}).", TenantId, ex.Status);
            return await ReleaseAsync(work.Item, AiCatalogItemOutcome.PausedUnavailable, ct);
        }
        catch (MeliException ex)
        {
            logger.LogWarning("Mercado Libre falló al leer la categoría del ítem {ItemId}: {Message}", work.Item.Id, ex.Message);
            return await TransientAsync(work, $"Mercado Libre no respondió después de {MaxTransientFailures} intentos.", ct);
        }
    }

    private async Task<AiCatalogItemOutcome> GatewayErrorAsync(Work work, Error error, CancellationToken ct)
    {
        switch (error.Code)
        {
            case "Ai.BudgetExceeded":
                return await ReleaseAsync(work.Item, AiCatalogItemOutcome.PausedBudget, ct);
            case "Ai.Disabled" or "Ai.TaskNotConfigured" or "Ai.ProviderAuth":
                return await ReleaseAsync(work.Item, AiCatalogItemOutcome.PausedUnavailable, ct);
            case "Ai.Rejected":
                // El proveedor rechazó el pedido (por ejemplo, por largo): repetirlo da lo mismo.
                return await GiveUpAsync(work, error.Message, ct);
            default:
                // Unavailable, TimedOut, Failed, Empty…: pasajeras. Esperan 1, 5 y 15 minutos y a la cuarta se da por perdido.
                return await TransientAsync(work, $"La IA no respondió después de {MaxTransientFailures} intentos.", ct);
        }
    }

    /// <summary>
    /// No hay más que probar. Sin propuesta, el ítem falla con el motivo. Con una redacción ya paga (falló el evaluador, o una
    /// segunda redacción), esa plata no se tira: queda para revisar a mano, sin el sello de "pasó".
    /// </summary>
    private async Task<AiCatalogItemOutcome> GiveUpAsync(Work work, string reason, CancellationToken ct)
    {
        if (work.State.Proposal is null) return await FailAsync(work, reason, ct);

        work.State = work.State with
        {
            Step = AiCatalogStep.Done,
            Passed = false,
            Critiques = [],
            TransientFailures = 0,
            GateNotes = [.. work.State.GateNotes, JudgeDownNote],
        };
        return await FinishAsync(work, ct);
    }

    private async Task<AiCatalogItemOutcome> FinishAsync(Work work, CancellationToken ct)
    {
        var state = work.State;
        if (state.FailureReason is { } reason) return await FailAsync(work, reason, ct);

        var notes = string.Join('\n', (state.Judge?.Motivos ?? []).Concat(state.GateNotes));
        // Puntaje 0 = el evaluador no contestó algo válido: no hay nota que mostrar.
        work.Item.ToReview(state.ToJson(), work.Item.Attempts, state.Judge is { Puntaje: > 0 } judge ? judge.Puntaje : null,
            notes.Length == 0 ? null : notes, Now);
        await ai.SaveChangesAsync(ct);
        return AiCatalogItemOutcome.Review;
    }

    private async Task<AiCatalogItemOutcome> FailAsync(Work work, string reason, CancellationToken ct)
    {
        work.State = work.State with { Step = AiCatalogStep.Done, FailureReason = reason };
        work.Item.Fail(work.State.ToJson(), Now);
        await ai.SaveChangesAsync(ct);
        return AiCatalogItemOutcome.Failed;
    }

    /// <summary>
    /// Suma una falla pasajera, la guarda y deja el ítem esperando (<see cref="RetryWaits"/>) en vez de reintentarlo en la pasada
    /// siguiente; a la cuarta se da por perdido (<see cref="GiveUpAsync"/>) con <paramref name="finalReason"/>.
    /// </summary>
    private async Task<AiCatalogItemOutcome> TransientAsync(Work work, string finalReason, CancellationToken ct)
    {
        work.State = work.State with { TransientFailures = work.State.TransientFailures + 1 };
        if (work.State.TransientFailures >= MaxTransientFailures) return await GiveUpAsync(work, finalReason, ct);

        work.Item.Checkpoint(work.State.ToJson(), work.Item.Attempts, Now);
        var wait = RetryWaits[Math.Min(work.State.TransientFailures, RetryWaits.Length) - 1];
        work.Item.DeferClaim(Now, wait, AiCatalogWorker.Lease);
        await ai.SaveChangesAsync(ct);
        return AiCatalogItemOutcome.Requeued;
    }

    private async Task<AiCatalogItemOutcome> ReleaseAsync(AiCatalogJobItem item, AiCatalogItemOutcome outcome, CancellationToken ct)
    {
        item.ReleaseClaim();
        await ai.SaveChangesAsync(ct);
        return outcome;
    }

    private Task<bool> IsRunningAsync(Guid jobId, CancellationToken ct) =>
        ai.CatalogJobs.AsNoTracking().AnyAsync(j => j.TenantId == TenantId && j.Id == jobId && j.Status == AiCatalogJobStatus.Running, ct);

    /// <summary>Suma al costo real del trabajo lo que costaron las corridas nuevas, según el libro de consumo.</summary>
    private async Task AddCostAsync(Guid jobId, AiCatalogItemState before, AiCatalogItemState after, CancellationToken ct)
    {
        var runIds = after.RunIds.Except(before.RunIds).ToList();
        if (runIds.Count == 0) return;

        var tenantId = TenantId;
        var cost = await ai.Usage.AsNoTracking()
            .Where(u => u.TenantId == tenantId && runIds.Contains(u.RunId))
            .SumAsync(u => (long?)u.CostMicroUsd, ct) ?? 0;
        if (cost == 0) return;

        await ai.CatalogJobs.Where(j => j.TenantId == tenantId && j.Id == jobId)
            .ExecuteUpdateAsync(s => s.SetProperty(j => j.ActualCostMicroUsd, j => j.ActualCostMicroUsd + cost), ct);
    }

    private async Task<AiCatalogProductData> BuildDataAsync(Product product, CancellationToken ct)
    {
        var tenantId = tenant.TenantId;
        var definitions = await catalog.SpecDefinitions.AsNoTracking().Where(d => d.TenantId == tenantId).ToListAsync(ct);
        var saved = await meli.ProductAttributes.AsNoTracking()
            .Where(a => a.TenantId == tenantId.Value && a.ProductId == product.Id).ToListAsync(ct);
        var categoryIds = product.CategoryIds.ToList();
        var categoryNames = categoryIds.Count == 0
            ? []
            : await catalog.Categories.AsNoTracking()
                .Where(c => c.TenantId == tenantId && categoryIds.Contains(c.Id)).Select(c => c.Name).ToListAsync(ct);
        return AiCatalogProductData.From(product, definitions, saved, categoryNames);
    }
}
