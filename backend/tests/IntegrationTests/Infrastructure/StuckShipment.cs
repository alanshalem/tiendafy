using Checkout.Core.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Deja una venta como queda cuando el carrier creó el envío y guardarlo acá
/// falló: la reserva "a revisar", con lo que devolvió el carrier. Pasa por el
/// mismo repositorio que usa <c>ShipmentWriteAhead</c>.
/// </summary>
public static class StuckShipment
{
    public static async Task LeaveAsync(ApiFactory factory, Guid tenantId, Guid orderId, string carrier, string note)
    {
        await using var scope = factory.Services.CreateTenantScope(tenantId);
        var claims = scope.ServiceProvider.GetRequiredService<IShipmentClaimRepository>();
        var (outcome, claimId) = await claims.TryClaimAsync(tenantId, orderId, carrier, DateTime.UtcNow.AddMinutes(-5));
        Assert.Equal(ShipmentClaimOutcome.Claimed, outcome);
        await claims.MarkNeedsReviewAsync(claimId, note);
    }
}
