namespace SharedKernel.Domain;

/// <summary>
/// Base para todos los eventos de dominio. Inmutables, nombrados en pasado
/// (OrderCreated, PaymentApproved). Hoy los agregados los levantan pero nadie
/// los despacha: el trabajo en segundo plano es polling a Postgres (ADR 0005).
/// </summary>
public abstract record DomainEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public DateTime OccurredAtUtc { get; init; } = DateTime.UtcNow;
}
