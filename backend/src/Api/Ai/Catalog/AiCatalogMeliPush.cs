using Ai.Infrastructure;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>Un tramo del lote. <c>Next</c> es desde dónde seguir (null = no queda más): el panel vuelve a llamar con <c>after = next</c>.</summary>
public sealed record AiCatalogPushResult(int Updated, AiCatalogBulkFailure[] Failed, Guid? Next);

public sealed record AiCatalogPushRequest(Guid? After, int? Limit);

/// <summary>
/// "Actualizar la ficha en ML" para fichas aprobadas: de un ítem o de un trabajo entero, por tramos. Cada tramo es un pedido HTTP corto
/// (de a 20 productos por defecto, 50 como mucho) y el panel sigue con <c>next</c> hasta que no quede más: ningún pedido dura minutos.
/// Es una escritura hacia afuera: lo llama un clic propio con el permiso de publicar en Mercado Libre.
/// </summary>
public sealed class AiCatalogMeliPush(AiDbContext ai, MeliDbContext meli, MeliListingAttributesPush push, ITenantContext tenant)
{
    public const int DefaultBatch = 20, MaxBatch = 50;

    private static readonly Error ItemNotFound = Error.NotFound("AiCatalog.ItemNotFound", "Esa ficha no existe.");

    private static Error Busy(MeliBusyException ex) => new("Meli.Busy", ex.Message, ErrorType.Unavailable);

    public async Task<Result<int>> PushItemAsync(Guid itemId, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.AsNoTracking()
            .FirstOrDefaultAsync(i => i.TenantId == tenant.TenantId.Value && i.Id == itemId, ct);
        if (item is null) return Result.Failure<int>(ItemNotFound);
        if (item.Status != AiCatalogItemStatus.Approved)
            return Result.Failure<int>(Error.Conflict("AiCatalog.NotApproved", "Primero aprobá la ficha: a Mercado Libre se manda lo aprobado."));

        try
        {
            return await push.PushAsync(tenant.TenantId, item.ProductId, ct);
        }
        catch (MeliBusyException ex)
        {
            return Result.Failure<int>(Busy(ex));
        }
    }

    public async Task<Result<AiCatalogPushResult>> PushJobAsync(Guid jobId, AiCatalogPushRequest? request, CancellationToken ct)
    {
        var tenantId = tenant.TenantId;
        if (!await ai.CatalogJobs.AsNoTracking().AnyAsync(j => j.TenantId == tenantId.Value && j.Id == jobId, ct))
            return Result.Failure<AiCatalogPushResult>(AiCatalogEndpoints.JobNotFound);

        // Sin cuenta real conectada no hay nada que empezar: el motivo vale para todo el lote.
        var token = await push.TokenAsync(tenantId, ct);
        if (token.IsFailure) return Result.Failure<AiCatalogPushResult>(token.Error);

        var approved = await ai.CatalogJobItems.AsNoTracking()
            .Where(i => i.TenantId == tenantId.Value && i.JobId == jobId && i.Status == AiCatalogItemStatus.Approved)
            .Select(i => i.ProductId).Distinct().ToListAsync(ct);
        var linked = (await meli.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == tenantId.Value && approved.Contains(l.ProductId))
            .Select(l => l.ProductId).Distinct().ToListAsync(ct)).ToHashSet();

        // El orden y el cursor se resuelven acá, con la misma comparación: no dependen de cómo ordena la base un uuid.
        var limit = Math.Clamp(request?.Limit ?? DefaultBatch, 1, MaxBatch);
        var pending = approved.Where(linked.Contains).Order()
            .Where(id => request?.After is not { } after || id.CompareTo(after) > 0).ToList();
        var slice = pending.Take(limit).ToList();

        var updated = 0;
        var failed = new List<AiCatalogBulkFailure>();
        try
        {
            foreach (var productId in slice)
            {
                var result = await push.PushAsync(tenantId, productId, token.Value, ct);
                if (result.IsSuccess) updated++;
                else failed.Add(new AiCatalogBulkFailure(productId, result.Error.Message));
            }
        }
        catch (MeliBusyException ex)
        {
            // Mercado Libre limita: se corta el tramo. Lo ya mandado es idempotente, así que volver a probar no hace daño.
            return Result.Failure<AiCatalogPushResult>(Busy(ex));
        }

        Guid? next = pending.Count > limit ? slice[^1] : null;
        return new AiCatalogPushResult(updated, [.. failed], next);
    }
}
