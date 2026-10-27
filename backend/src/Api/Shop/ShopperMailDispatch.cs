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
/// </summary>
public sealed class ShopperMailDispatch(
    IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, ILogger<ShopperMailDispatch> log)
{
    public void Run(Guid tenantId, Func<IServiceProvider, CancellationToken, Task> work)
    {
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
        }, CancellationToken.None);
    }
}
