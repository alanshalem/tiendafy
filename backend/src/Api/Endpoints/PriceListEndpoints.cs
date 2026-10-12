using Api.Auth;
using Api.Pricing;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Listas de precios: mayorista, minorista, por canal.
///
/// Hasta acá el catálogo tenía un precio y punto, y la repreciación masiva
/// servía para moverlo a todos juntos. Eso no alcanza para un importador que
/// le vende al público y a revendedores el mismo día: no hay forma de que
/// convivan dos precios del mismo producto.
///
/// Una lista guarda una REGLA, no una copia de precios. Ver
/// <see cref="PriceList"/> para por qué.
/// </summary>
public static class PriceListEndpoints
{
    public static RouteGroupBuilder MapPriceListEndpoints(this RouteGroupBuilder group)
    {
        var lists = group.MapGroup("/price-lists").RequireTenant().RequirePermission(Permission.PricesManage);

        // Los nombres de las listas también los necesitan la venta manual y la
        // ficha del cliente (para elegir con qué lista se le cobra).
        group.MapGet("/price-lists", async (ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var rows = await db.PriceLists.AsNoTracking().Where(l => l.TenantId == tid)
                .OrderBy(l => l.SortOrder).ThenBy(l => l.Name).ToListAsync(ct);

            // Cuántos precios a mano tiene cada lista, en una sola consulta: es
            // el número que dice si la regla se está respetando o si la lista se
            // volvió una planilla de excepciones.
            var manual = await db.PriceListItems.AsNoTracking().Where(i => i.TenantId == tid)
                .GroupBy(i => i.PriceListId)
                .Select(g => new { PriceListId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.PriceListId, x => x.Count, ct);

            var byId = rows.ToDictionary(l => l.Id, l => l.Name);

            return Results.Ok(new
            {
                items = rows.Select(l => new
                {
                    id = l.Id,
                    name = l.Name,
                    currency = l.Currency,
                    basedOnPriceListId = l.BasedOnPriceListId,
                    basedOnName = l.BasedOnPriceListId is { } b ? byId.GetValueOrDefault(b) : null,
                    adjustmentPercent = l.AdjustmentPercent,
                    rounding = l.Rounding,
                    notes = l.Notes,
                    active = l.Active,
                    sortOrder = l.SortOrder,
                    manualPrices = manual.GetValueOrDefault(l.Id),
                }),
            });
        }).RequireTenant()
            .RequireAnyPermission(Permission.PricesManage, Permission.OrdersCreate, Permission.CustomersWrite);

        lists.MapPost("/", async (
            PriceListRequest req, ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var created = PriceList.Create(tenant.TenantId, req.Name, req.Currency);
            if (created.IsFailure) return created.Error.ToProblem();

            var updated = created.Value.Update(
                req.Name, req.Currency, req.BasedOnPriceListId, req.AdjustmentPercent ?? 0,
                req.Rounding ?? PriceRounding.None, req.Notes, req.Active ?? true, req.SortOrder ?? 0);
            if (updated.IsFailure) return updated.Error.ToProblem();

            var cycle = await CheckCycleAsync(db, tenant.TenantId, created.Value.Id, req.BasedOnPriceListId, ct);
            if (cycle.IsFailure) return cycle.Error.ToProblem();

            db.PriceLists.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/price-lists/{created.Value.Id}", new { id = created.Value.Id });
        });

        lists.MapPatch("/{id:guid}", async (
            Guid id, PriceListRequest req, ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var list = await db.PriceLists.FirstOrDefaultAsync(l => l.Id == id && l.TenantId == tid, ct);
            if (list is null) return Results.NotFound();

            var cycle = await CheckCycleAsync(db, tid, id, req.BasedOnPriceListId, ct);
            if (cycle.IsFailure) return cycle.Error.ToProblem();

            var updated = list.Update(
                req.Name, req.Currency, req.BasedOnPriceListId, req.AdjustmentPercent ?? 0,
                req.Rounding ?? PriceRounding.None, req.Notes, req.Active ?? true, req.SortOrder ?? 0);
            if (updated.IsFailure) return updated.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        lists.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var list = await db.PriceLists.FirstOrDefaultAsync(l => l.Id == id && l.TenantId == tid, ct);
            if (list is null) return Results.NotFound();

            // Borrar una lista sobre la que se calculan otras dejaría a esas
            // otras devolviendo el precio del producto, sin aviso.
            var dependents = await db.PriceLists.AsNoTracking()
                .CountAsync(l => l.TenantId == tid && l.BasedOnPriceListId == id, ct);
            if (dependents > 0)
                return Error.Validation(
                    "PriceList.InUse",
                    $"Hay {dependents} lista(s) que se calculan sobre esta. Cambiales la base antes de borrarla.").ToProblem();

            var items = await db.PriceListItems.Where(i => i.TenantId == tid && i.PriceListId == id).ToListAsync(ct);
            db.PriceListItems.RemoveRange(items);
            db.PriceLists.Remove(list);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Los precios que da una lista, producto por producto: lo que se mira
        // para decidir si el porcentaje quedó bien o hay que tocar alguno.
        lists.MapGet("/{id:guid}/prices", async (
            Guid id, ITenantContext tenant, CatalogDbContext db, PriceListService prices, CancellationToken ct,
            string? q = null, int limit = 50, int offset = 0) =>
        {
            var tid = tenant.TenantId;
            if (!await db.PriceLists.AsNoTracking().AnyAsync(l => l.Id == id && l.TenantId == tid, ct))
                return Results.NotFound();

            var query = ProductTextSearch.Matching(
                db.Products.AsNoTracking().Where(p => p.TenantId == tid), q, includeSku: true);

            var (products, total) = await query
                .OrderBy(p => p.Name)
                .PageAsync(offset, limit, ct);

            var resolver = await prices.LoadAsync(tid, ct);

            return Results.Ok(new
            {
                total,
                items = products.SelectMany(p => p.Variants.Select(v =>
                {
                    var priced = resolver.Explain(id, v.Id, v.Price.AmountInMinorUnits);
                    return new
                    {
                        variantId = v.Id,
                        productId = p.Id,
                        productName = p.Name,
                        sku = v.Sku,
                        variantDescription = string.Join(" · ", v.OptionValues),
                        basePriceMinor = v.Price.AmountInMinorUnits,
                        priceMinor = priced.PriceMinor,
                        isManual = priced.IsManual,
                        currency = v.Price.Currency,
                    };
                })),
            });
        });

        // Escribir un precio a mano, o sacarlo (precio null) para que vuelva a
        // seguir la regla.
        lists.MapPut("/{id:guid}/prices/{variantId:guid}", async (
            Guid id, Guid variantId, ManualPriceRequest req,
            ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            if (!await db.PriceLists.AsNoTracking().AnyAsync(l => l.Id == id && l.TenantId == tid, ct))
                return Results.NotFound();

            var existing = await db.PriceListItems
                .FirstOrDefaultAsync(i => i.TenantId == tid && i.PriceListId == id && i.VariantId == variantId, ct);

            if (req.PriceMinor is not { } price)
            {
                if (existing is not null) db.PriceListItems.Remove(existing);
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }

            if (existing is null)
            {
                var created = PriceListItem.Create(tid, id, variantId, price);
                if (created.IsFailure) return created.Error.ToProblem();
                db.PriceListItems.Add(created.Value);
            }
            else
            {
                var changed = existing.ChangePrice(price);
                if (changed.IsFailure) return changed.Error.ToProblem();
            }

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    /// <summary>
    /// Que la nueva base no cierre un círculo. Se pregunta antes de guardar:
    /// un ciclo guardado lo resuelve el resolver en silencio y deja precios que
    /// después nadie puede explicar.
    /// </summary>
    private static async Task<Result> CheckCycleAsync(
        CatalogDbContext db, TenantId tenantId, Guid listId, Guid? basedOn, CancellationToken ct)
    {
        if (basedOn is null) return Result.Success();

        var all = await db.PriceLists.AsNoTracking().Where(l => l.TenantId == tenantId).ToListAsync(ct);
        if (all.TrueForAll(l => l.Id != basedOn))
            return Result.Failure(Error.Validation("PriceList.UnknownBase", "Esa lista base no existe."));

        return new PriceResolver(all, []).CanBaseOn(listId, basedOn);
    }
}

public sealed record PriceListRequest(
    string? Name, string? Currency, Guid? BasedOnPriceListId, decimal? AdjustmentPercent,
    string? Rounding, string? Notes, bool? Active, int? SortOrder);

public sealed record ManualPriceRequest(long? PriceMinor);
