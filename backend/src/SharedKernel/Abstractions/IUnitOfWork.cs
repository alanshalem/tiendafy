namespace SharedKernel.Abstractions;

/// <summary>
/// Frontera transaccional. Implementada por el DbContext de cada módulo;
/// los handlers la usan para commitear sin acoplarse a EF Core.
/// </summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
