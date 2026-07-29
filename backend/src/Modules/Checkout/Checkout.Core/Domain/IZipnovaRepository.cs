namespace Checkout.Core.Domain;

public interface IZipnovaRepository
{
    Task<ZipnovaConfig?> GetConfigAsync(Guid tenantId, CancellationToken ct = default);
    Task AddConfigAsync(ZipnovaConfig config, CancellationToken ct = default);
    Task RemoveConfigAsync(ZipnovaConfig config, CancellationToken ct = default);

    Task<ZipnovaShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default);
    Task AddShipmentAsync(ZipnovaShipment shipment, CancellationToken ct = default);

    Task SaveChangesAsync(CancellationToken ct = default);
}
