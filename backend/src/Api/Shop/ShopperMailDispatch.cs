using Api.Middleware;
using SharedKernel.Common;

namespace Api.Shop;

/// <summary>
/// Corre un trabajo de la cuenta del comprador (armar un token y mandar el
/// mail) DESPUÉS de contestar el request, en su propio scope y con la tienda
/// puesta, como si fuera un request aparte.
///
/// <para>
/// Para lo que no tiene que delatar si una cuenta existe: "¿Olvidaste tu
/// contraseña?" contesta lo mismo y tarda lo mismo haya o no a quién
/// mandarle el mail, porque el mail (lo lento: plantilla, Resend) no corre
/// en el request. Es best-effort, como el envío de antes: si la API se
/// reinicia justo, ese mail no sale y la persona lo vuelve a pedir.
/// </para>
///
/// <para>
/// Con tope: si hay más de <see cref="Capacity"/> trabajos sin terminar (un
/// ataque de "olvidé mi contraseña" en masa, Resend lento), los nuevos se
/// descartan con un aviso en el log en vez de acumular tareas en memoria
/// hasta tumbar la API.
/// </para>
/// </summary>
public sealed class ShopperMailDispatch
{
    /// <summary>Cuántos trabajos pueden estar en curso o esperando a la vez.</summary>
    public const int Capacity = 1000;

    private readonly IServiceScopeFactory scopes;
    private readonly IHostApplicationLifetime lifetime;
    private readonly ILogger<ShopperMailDispatch> log;
    private readonly int capacity;
    private int pending;

    public ShopperMailDispatch(
        IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, ILogger<ShopperMailDispatch> log)
        : this(scopes, lifetime, log, Capacity)
    {
    }

    internal ShopperMailDispatch(
        IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, ILogger<ShopperMailDispatch> log, int capacity)
    {
        this.scopes = scopes;
        this.lifetime = lifetime;
        this.log = log;
        this.capacity = capacity;
    }

    /// <summary>Trabajos en curso o esperando (para los tests).</summary>
    internal int Pending => Volatile.Read(ref pending);

    public void Run(Guid tenantId, Func<IServiceProvider, CancellationToken, Task> work)
    {
        if (Interlocked.Increment(ref pending) > capacity)
        {
            Interlocked.Decrement(ref pending);
            log.LogWarning(
                "Demasiados emails de la cuenta del comprador en curso ({Capacity}): se descarta uno (tienda {TenantId}).",
                capacity, tenantId);
            return;
        }

        var ct = lifetime.ApplicationStopping;
        _ = Task.Run(async () =>
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(tenantId));
                await work(scope.ServiceProvider, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // La API se está apagando: el mail no sale.
            }
            catch (Exception ex)
            {
                log.LogError(ex, "No se pudo mandar un email de la cuenta del comprador (tienda {TenantId}).", tenantId);
            }
            finally
            {
                Interlocked.Decrement(ref pending);
            }
        }, CancellationToken.None);
    }
}
