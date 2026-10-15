using SharedKernel.Common;

namespace SharedKernel.Domain;

/// <summary>
/// Raíz de agregado multi-tenant. Toda raíz lleva TenantId (regla: ninguna
/// tabla nace sin tenant_id). Acumula domain events, que hoy no se despachan
/// (ver <see cref="DomainEvent"/> y el ADR 0005).
/// </summary>
public abstract class AggregateRoot : Entity
{
    private readonly List<DomainEvent> _domainEvents = [];

    public TenantId TenantId { get; protected set; }

    protected AggregateRoot(Guid id, TenantId tenantId) : base(id)
    {
        TenantId = tenantId;
    }

    protected AggregateRoot() { } // EF Core

    public IReadOnlyList<DomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void RaiseDomainEvent(DomainEvent domainEvent) =>
        _domainEvents.Add(domainEvent);

    public void ClearDomainEvents() => _domainEvents.Clear();
}
