using SharedKernel.Domain;

namespace Tenancy.Contracts.Events;

/// <summary>
/// Tenant nuevo. Consumidores típicos: Billing (crear suscripción trial),
/// Themes (provisionar tema default), Notifications (email de bienvenida).
/// </summary>
public sealed record TenantCreatedEvent(
    Guid TenantId,
    string Name,
    string Subdomain) : DomainEvent;
