namespace SharedKernel.Domain;

/// <summary>
/// Base para todos los eventos de dominio. Inmutables, nombrados en pasado
/// (OrderCreated, PaymentApproved). Se publican vía Outbox, nunca directo a RabbitMQ.
/// </summary>
public abstract record DomainEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public DateTime OccurredAtUtc { get; init; } = DateTime.UtcNow;
}
