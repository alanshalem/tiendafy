using SharedKernel.Common;

namespace Checkout.Core.Domain;

public interface ICheckoutRepository
{
    Task<CheckoutSession?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task AddAsync(CheckoutSession session, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);

    /// <summary>
    /// Guarda, salvo que otro pedido haya cambiado la misma compra desde que se
    /// leyó (token de concurrencia): en ese caso no guarda nada y devuelve false.
    /// </summary>
    Task<bool> TrySaveChangesAsync(CancellationToken ct = default);
}
