using Identity.Infrastructure;
using Api.Auth;
using Inventory.Core.Domain;
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
                items = items.Select(s => new { s.VariantId, s.Available, s.Reserved }),
            });
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

public sealed record ReserveRequest(Guid VariantId, int Quantity);
