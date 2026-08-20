using Api.Auth;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class InventoryEndpoints
{
    public static RouteGroupBuilder MapInventoryEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: stock/ledger. Exige membresía.
        var inventory = group.MapGroup("/inventory").RequirePermission(Permission.InventoryRead).RequirePermissionForWrites(Permission.InventoryWrite);

        // Stock por lista de variantes: /inventory?variantIds=a,b,c
        inventory.MapGet("/", async (
            string variantIds,
            ITenantContext tenant,
            IStockRepository repository,
            CancellationToken ct) =>
        {
            var ids = variantIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.TryParse(s.Trim(), out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty)
                .ToList();

            var items = await repository.GetByVariantsAsync(tenant.TenantId, ids, ct);
            return Results.Ok(new
            {
                items = items.Select(s => new { s.VariantId, s.Available, s.Reserved, s.Location }),
            });
        });

        // Resumen del depósito: lo que la tabla de stock no contesta de un vistazo
        // — cuántas unidades hay, cuánta plata inmovilizan y qué está en cero o
        // por agotarse. Solo proyecta dos columnas por variante: el costo está
        // serializado en texto, así que la valorización se suma en memoria sí o sí.
        inventory.MapGet("/summary", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalog,
            Inventory.Infrastructure.Persistence.InventoryDbContext inventoryDb,
            int? lowStockThreshold, CancellationToken ct) =>
        {
            var low = Math.Clamp(lowStockThreshold ?? 5, 1, 100);

            var variants = await catalog.Products.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId)
                .SelectMany(p => p.Variants)
                .Select(v => new { v.Id, v.Cost })
                .ToListAsync(ct);

            var stock = await inventoryDb.StockItems.AsNoTracking()
                .Select(s => new { s.VariantId, s.Available, s.Reserved })
                .ToListAsync(ct);
            var available = stock
                .GroupBy(s => s.VariantId)
                .ToDictionary(g => g.Key, g => g.Sum(s => s.Available));

            var units = 0;
            var outOfStock = 0;
            var lowStock = 0;
            long stockValue = 0;
            var currency = SharedKernel.Common.Money.DefaultCurrency;

            foreach (var v in variants)
            {
                var qty = available.GetValueOrDefault(v.Id, 0);
                units += qty;
                if (qty <= 0) outOfStock++;
                else if (qty <= low) lowStock++;

                // Valorización A COSTO, no a precio de venta: es la plata parada
                // en el depósito, no lo que se espera facturar por ella.
                if (v.Cost is { } cost)
                {
                    stockValue += cost.AmountInMinorUnits * Math.Max(0, qty);
                    currency = cost.Currency;
                }
            }

            return Results.Ok(new
            {
                variants = variants.Count,
                units,
                outOfStock,
                lowStock,
                reserved = stock.Sum(s => s.Reserved),
                stockValueMinor = stockValue,
                currency,
                withoutCost = variants.Count(v => v.Cost is null),
            });
        });

        // Ubicación física (bin) de la variante en el depósito.
        inventory.MapPut("/{variantId:guid}/location", async (
            Guid variantId, SetLocationRequest request, ITenantContext tenant,
            IStockRepository repository, CancellationToken ct) =>
        {
            if (request.Location is { Length: > 60 })
                return SharedKernel.Common.Error.Validation(
                    "Inventory.InvalidLocation", "La ubicación admite hasta 60 caracteres.").ToProblem();
            await repository.SetLocationAsync(tenant.TenantId, variantId, request.Location, ct);
            return Results.NoContent();
        });

        // Ajuste manual del merchant (alta inicial o corrección).
        inventory.MapPut("/{variantId:guid}", async (
            Guid variantId,
            SetStockRequest request,
            ITenantContext tenant,
            IStockRepository repository,
            CancellationToken ct) =>
        {
            if (request.Available < 0)
                return Results.Problem(title: "Stock.Negative", detail: "Available cannot be negative.", statusCode: 400);

            var item = await repository.SetAvailableAsync(
                tenant.TenantId, variantId, request.Available, request.Reason, ct);
            return Results.Ok(new { item.VariantId, item.Available, item.Reserved });
        });

        // Reserva (la usará Checkout; expuesta para pruebas y POS futuro).
        inventory.MapPost("/reservations", async (
            ReserveRequest request,
            ITenantContext tenant,
            IStockRepository repository,
            CancellationToken ct) =>
        {
            var result = await repository.TryReserveAsync(tenant.TenantId, request.VariantId, request.Quantity, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/inventory/reservations/{result.Value.Id}", new
                {
                    result.Value.Id,
                    result.Value.VariantId,
                    result.Value.Quantity,
                    status = result.Value.Status.ToString().ToUpperInvariant(),
                    result.Value.ExpiresAtUtc,
                })
                : result.Error.ToProblem();
        });

        inventory.MapPost("/reservations/{id:guid}/confirm", async (
            Guid id, ITenantContext tenant, IStockRepository repository, CancellationToken ct) =>
        {
            var result = await repository.ConfirmReservationAsync(tenant.TenantId, id, ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

        inventory.MapPost("/reservations/{id:guid}/release", async (
            Guid id, ITenantContext tenant, IStockRepository repository, CancellationToken ct) =>
        {
            var result = await repository.ReleaseReservationAsync(tenant.TenantId, id, ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

        // Ledger de movimientos por variante (auditoría del merchant).
        inventory.MapGet("/{variantId:guid}/ledger", async (
            Guid variantId, ITenantContext tenant, IStockRepository repository, CancellationToken ct) =>
        {
            var movements = await repository.GetLedgerAsync(tenant.TenantId, variantId, 50, ct);
            return Results.Ok(new
            {
                items = movements.Select(m => new
                {
                    type = m.Type.ToString(),
                    m.Quantity,
                    m.Reason,
                    m.OccurredAtUtc,
                }),
            });
        });

        return group;
    }
}

public sealed record SetStockRequest(int Available, string? Reason);

public sealed record SetLocationRequest(string? Location);

public sealed record ReserveRequest(Guid VariantId, int Quantity);
