namespace SharedKernel.Exceptions;

/// <summary>
/// Violación de invariante de dominio (estado imposible, transición inválida).
/// El middleware de excepciones la mapea a 422.
/// </summary>
public class DomainException(string message) : Exception(message);

/// <summary>Entidad no encontrada (o pertenece a otro tenant — indistinguible a propósito). Mapea a 404.</summary>
public class NotFoundException(string entity, object id)
    : Exception($"{entity} with id '{id}' was not found.")
{
    public string Entity { get; } = entity;
    public object Id { get; } = id;
}

/// <summary>Sin autenticación válida. Mapea a 401.</summary>
public class UnauthorizedException(string message = "Authentication required.") : Exception(message);

/// <summary>Autenticado pero sin el permiso requerido. Mapea a 403.</summary>
public class ForbiddenException(string permission)
    : Exception($"Missing required permission '{permission}'.")
{
    public string Permission { get; } = permission;
}

/// <summary>Conflicto de concurrencia o de estado (ej: stock insuficiente). Mapea a 409.</summary>
public class ConflictException(string message) : Exception(message);

/// <summary>Request no pudo resolverse a un tenant (dominio desconocido). Mapea a 404.</summary>
public class TenantNotResolvedException(string host)
    : Exception($"No tenant resolved for host '{host}'.")
{
    public string Host { get; } = host;
}
