using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Inventory.Infrastructure.Persistence;

public sealed class StockRepository(InventoryDbContext context) : IStockRepository
{
    public async Task<IReadOnlyList<StockItem>> GetByVariantsAsync(
        TenantId tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default) =>
        await context.StockItems.AsNoTracking()
            .Where(s => s.TenantId == tenantId && variantIds.Contains(s.VariantId))
            .ToListAsync(ct);

    public async Task SetLocationAsync(TenantId tenantId, Guid variantId, string? location, CancellationToken ct = default)
    {
        var item = await context.StockItems
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.VariantId == variantId, ct);
        if (item is null)
        {
            item = new StockItem(tenantId, variantId, 0);
            context.StockItems.Add(item);
        }
        item.SetLocation(location);
        await context.SaveChangesAsync(ct);
    }

    public async Task<StockItem> SetAvailableAsync(
        TenantId tenantId, Guid variantId, int available, string? reason, CancellationToken ct = default)
    {
        await using var tx = await context.Database.BeginTransactionAsync(ct);

        var item = await context.StockItems
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.VariantId == variantId, ct);

        int delta;
        if (item is null)
        {
            item = new StockItem(tenantId, variantId, available);
            context.StockItems.Add(item);
            delta = available;
            context.Movements.Add(new StockMovement(tenantId, variantId, MovementType.Initial, delta, reason: reason));
        }
        else
        {
            delta = available - item.Available;
            // Set absoluto vía SQL (la entidad no expone mutación — a propósito).
            await context.StockItems
                .Where(s => s.Id == item.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Available, available), ct);
            context.Movements.Add(new StockMovement(tenantId, variantId, MovementType.Adjustment, delta, reason: reason));
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return (await GetByVariantsAsync(tenantId, [variantId], ct))[0];
    }

    public async Task<int> AdjustAvailableAsync(
        TenantId tenantId, Guid variantId, int delta, string? reason, CancellationToken ct = default)
    {
        await using var tx = await context.Database.BeginTransactionAsync(ct);

        // Delta en el propio UPDATE (Math.Max → GREATEST): atómico contra las
        // reservas del checkout, que mutan available con el mismo patrón.
        var updated = await context.StockItems
            .Where(s => s.TenantId == tenantId && s.VariantId == variantId)
            .ExecuteUpdateAsync(s => s.SetProperty(
                x => x.Available, x => Math.Max(0, x.Available + delta)), ct);

        if (updated == 0)
        {
            context.StockItems.Add(new StockItem(tenantId, variantId, Math.Max(0, delta)));
            context.Movements.Add(new StockMovement(
                tenantId, variantId, MovementType.Initial, Math.Max(0, delta), reason: reason));
        }
        else
        {
            context.Movements.Add(new StockMovement(
                tenantId, variantId, MovementType.Adjustment, delta, reason: reason));
        }

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return (await GetByVariantsAsync(tenantId, [variantId], ct))[0].Available;
    }

    public async Task<Result<Reservation>> TryReserveAsync(
        TenantId tenantId, Guid variantId, int quantity, CancellationToken ct = default)
    {
        if (quantity <= 0)
            return Result.Failure<Reservation>(Error.Validation("Reservation.InvalidQuantity", "Quantity must be positive."));

        await using var tx = await context.Database.BeginTransactionAsync(ct);

        // EL statement anti-oversell: condicional y atómico. 0 filas = no hay stock.
        var updated = await context.StockItems
            .Where(s => s.TenantId == tenantId && s.VariantId == variantId && s.Available >= quantity)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Available, x => x.Available - quantity)
                .SetProperty(x => x.Reserved, x => x.Reserved + quantity), ct);

        if (updated == 0)
            return Result.Failure<Reservation>(Error.Conflict(
                "Stock.Insufficient", "Not enough stock for this variant."));

        var reservation = new Reservation(tenantId, variantId, quantity);
        context.Reservations.Add(reservation);
        context.Movements.Add(new StockMovement(
            tenantId, variantId, MovementType.Reserved, -quantity, reservation.Id));

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return reservation;
    }

    public async Task<Result> ConfirmReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default)
    {
        await using var tx = await context.Database.BeginTransactionAsync(ct);

        var reservation = await context.Reservations
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.Id == reservationId, ct);
        if (reservation is null)
            return Result.Failure(Error.NotFound("Reservation", reservationId));

        var confirm = reservation.Confirm(DateTime.UtcNow);
        if (confirm.IsFailure)
            return confirm;

        await context.StockItems
            .Where(s => s.TenantId == tenantId && s.VariantId == reservation.VariantId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Reserved, x => x.Reserved - reservation.Quantity), ct);

        context.Movements.Add(new StockMovement(
            tenantId, reservation.VariantId, MovementType.Sold, 0, reservation.Id));

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Result.Success();
    }

    public async Task<Result> ReleaseReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default)
    {
        await using var tx = await context.Database.BeginTransactionAsync(ct);

        var reservation = await context.Reservations
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.Id == reservationId, ct);
        if (reservation is null)
            return Result.Failure(Error.NotFound("Reservation", reservationId));

        var release = reservation.Release();
        if (release.IsFailure)
            return release;

        await context.StockItems
            .Where(s => s.TenantId == tenantId && s.VariantId == reservation.VariantId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Reserved, x => x.Reserved - reservation.Quantity)
                .SetProperty(x => x.Available, x => x.Available + reservation.Quantity), ct);

        context.Movements.Add(new StockMovement(
            tenantId, reservation.VariantId, MovementType.Released, reservation.Quantity, reservation.Id));

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Result.Success();
    }

    public async Task<int> ReleaseExpiredAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        // Lote chico por pasada: el job corre seguido; sin locks largos.
        var expired = await context.Reservations
            .Where(r => r.Status == ReservationStatus.Active && r.ExpiresAtUtc <= nowUtc)
            .Take(100)
            .ToListAsync(ct);

        foreach (var reservation in expired)
        {
            await using var tx = await context.Database.BeginTransactionAsync(ct);

            if (reservation.Release().IsFailure)
                continue;

            await context.StockItems
                .Where(s => s.TenantId == reservation.TenantId && s.VariantId == reservation.VariantId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Reserved, x => x.Reserved - reservation.Quantity)
                    .SetProperty(x => x.Available, x => x.Available + reservation.Quantity), ct);

            context.Movements.Add(new StockMovement(
                reservation.TenantId, reservation.VariantId, MovementType.ReleaseExpired,
                reservation.Quantity, reservation.Id));

            await context.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        return expired.Count;
    }

    public async Task<IReadOnlyList<StockMovement>> GetLedgerAsync(
        TenantId tenantId, Guid variantId, int limit, CancellationToken ct = default) =>
        await context.Movements.AsNoTracking()
            .Where(m => m.TenantId == tenantId && m.VariantId == variantId)
            .OrderByDescending(m => m.OccurredAtUtc)
            .Take(limit)
            .ToListAsync(ct);
}
