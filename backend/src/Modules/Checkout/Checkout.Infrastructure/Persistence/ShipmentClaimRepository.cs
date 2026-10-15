using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SharedKernel.Common;

namespace Checkout.Infrastructure.Persistence;

public sealed class ShipmentClaimRepository(CheckoutDbContext context) : IShipmentClaimRepository
{
    public async Task<(ShipmentClaimOutcome Outcome, Guid ClaimId)> TryClaimAsync(
        Guid tenantId, Guid orderId, string carrier, DateTime staleBeforeUtc, CancellationToken ct = default)
    {
        // Una reserva abandonada (el proceso murió con el pedido al carrier en
        // vuelo) no traba la venta para siempre. Las que quedaron a revisar no
        // vencen nunca: ahí el carrier ya creó un envío.
        var stale = await context.ShipmentClaims
            .Where(c => c.TenantId == tenantId && c.OrderId == orderId && c.Carrier == carrier
                && c.Status == ShipmentClaimStatus.InProgress && c.ClaimedAtUtc < staleBeforeUtc)
            .ExecuteDeleteAsync(ct);

        var claim = ShipmentClaim.Create(tenantId, orderId, carrier);
        context.ShipmentClaims.Add(claim);
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Ganó otro pedido. La entidad se suelta para que un SaveChanges
            // posterior del mismo request no la vuelva a intentar.
            context.Entry(claim).State = EntityState.Detached;
            var status = await context.ShipmentClaims.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.OrderId == orderId && c.Carrier == carrier)
                .Select(c => c.Status)
                .FirstOrDefaultAsync(ct);
            return (status == ShipmentClaimStatus.NeedsReview ? ShipmentClaimOutcome.NeedsReview : ShipmentClaimOutcome.Busy,
                Guid.Empty);
        }

        return (stale > 0 ? ShipmentClaimOutcome.ClaimedOverStale : ShipmentClaimOutcome.Claimed, claim.Id);
    }

    public async Task ReleaseAsync(Guid claimId, CancellationToken ct = default)
    {
        var tracked = context.ShipmentClaims.Local.FirstOrDefault(c => c.Id == claimId);
        if (tracked is not null) context.Entry(tracked).State = EntityState.Detached;

        await context.ShipmentClaims
            .Where(c => c.Id == claimId && c.Status == ShipmentClaimStatus.InProgress)
            .ExecuteDeleteAsync(ct);
    }

    public Task MarkNeedsReviewAsync(Guid claimId, string note, CancellationToken ct = default)
    {
        var clipped = Text.Clip(note, ShipmentClaim.MaxNoteLength);
        return context.ShipmentClaims
            .Where(c => c.Id == claimId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Status, ShipmentClaimStatus.NeedsReview)
                .SetProperty(c => c.Note, clipped), ct);
    }

    public Task<ShipmentClaim?> FindNeedsReviewAsync(Guid tenantId, Guid orderId, string carrier, CancellationToken ct = default) =>
        NeedsReview(tenantId, orderId, carrier).AsNoTracking().FirstOrDefaultAsync(ct);

    public async Task<bool> ReleaseNeedsReviewAsync(Guid tenantId, Guid orderId, string carrier, CancellationToken ct = default) =>
        await NeedsReview(tenantId, orderId, carrier).ExecuteDeleteAsync(ct) > 0;

    public async Task<bool> CloseNeedsReviewAsync<TShipment>(
        Guid tenantId, Guid orderId, string carrier, TShipment recorded, CancellationToken ct = default)
        where TShipment : class
    {
        var claim = await NeedsReview(tenantId, orderId, carrier).FirstOrDefaultAsync(ct);
        if (claim is null) return false;

        // Un solo SaveChanges: borrar la reserva y guardar el envío van en la
        // misma transacción. Si otro pedido la resolvió en el medio, el borrado
        // no encuentra la fila (concurrencia) o el envío choca con el índice
        // único de la venta, y no queda nada a medias.
        context.ShipmentClaims.Remove(claim);
        context.Add(recorded);
        try
        {
            await context.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException ex) when (ex is DbUpdateConcurrencyException
            || ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            context.Entry(claim).State = EntityState.Detached;
            context.Entry(recorded).State = EntityState.Detached;
            return false;
        }
    }

    private IQueryable<ShipmentClaim> NeedsReview(Guid tenantId, Guid orderId, string carrier) =>
        context.ShipmentClaims.Where(c => c.TenantId == tenantId && c.OrderId == orderId
            && c.Carrier == carrier && c.Status == ShipmentClaimStatus.NeedsReview);
}
