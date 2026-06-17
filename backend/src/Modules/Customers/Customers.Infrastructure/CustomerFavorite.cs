namespace Customers.Infrastructure;

/// <summary>Producto marcado como favorito por un comprador logueado.</summary>
public sealed class CustomerFavorite
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private CustomerFavorite() { } // EF Core

    public static CustomerFavorite Create(Guid customerId, Guid tenantId, Guid productId) => new()
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        TenantId = tenantId,
        ProductId = productId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
