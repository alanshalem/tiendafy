namespace SharedKernel.Exceptions;

/// <summary>
/// Violación de invariante de dominio (estado imposible, transición inválida).
/// Ningún middleware la traduce a un status: quien llama a un método que la
/// tira la atrapa (ver UpdateTenantHandler) o valida antes de llamarlo.
/// </summary>
public class DomainException(string message) : Exception(message);
