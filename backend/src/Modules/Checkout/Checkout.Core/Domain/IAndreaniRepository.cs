namespace Checkout.Core.Domain;

public interface IAndreaniRepository
{
    Task<AndreaniConfig?> GetConfigAsync(Guid tenantId, CancellationToken ct = default);
    Task AddConfigAsync(AndreaniConfig config, CancellationToken ct = default);
    Task RemoveConfigAsync(AndreaniConfig config, CancellationToken ct = default);

    Task<AndreaniShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default);
    Task AddShipmentAsync(AndreaniShipment shipment, CancellationToken ct = default);

    Task SaveChangesAsync(CancellationToken ct = default);
}
