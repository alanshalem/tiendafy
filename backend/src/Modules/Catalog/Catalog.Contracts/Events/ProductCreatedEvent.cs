using SharedKernel.Domain;

namespace Catalog.Contracts.Events;

public sealed record ProductCreatedEvent(
    Guid TenantId,
    Guid ProductId,
    string Name,
    string Slug) : DomainEvent;

public sealed record ProductPublishedEvent(
    Guid TenantId,
    Guid ProductId,
    string Slug) : DomainEvent;
