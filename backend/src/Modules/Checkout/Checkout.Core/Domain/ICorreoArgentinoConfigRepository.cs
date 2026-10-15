namespace Checkout.Core.Domain;

/// <summary>Configuración de Correo Argentino de la tienda y las altas de envío de sus ventas.</summary>
public interface ICorreoArgentinoConfigRepository
{
    Task<CorreoArgentinoConfig?> GetAsync(Guid tenantId, CancellationToken ct = default);
    Task AddAsync(CorreoArgentinoConfig config, CancellationToken ct = default);
    Task RemoveAsync(CorreoArgentinoConfig config, CancellationToken ct = default);

    Task<CorreoShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default);
    Task AddShipmentAsync(CorreoShipment shipment, CancellationToken ct = default);

    Task SaveChangesAsync(CancellationToken ct = default);
}
