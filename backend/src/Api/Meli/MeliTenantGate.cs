using System.Collections.Concurrent;
using System.Net;
using MercadoLibre.Infrastructure;

namespace Api.Meli;

/// <summary>Espera entre reintentos. En producción es <c>Task.Delay</c>; los tests la reemplazan por una que anota y no espera.</summary>
public delegate Task MeliWait(TimeSpan delay, CancellationToken ct);

/// <summary>Mercado Libre sigue limitando el tráfico después de todos los reintentos: se sigue en un rato, no es una falla.</summary>
public sealed class MeliBusyException(string message) : Exception(message);

/// <summary>
/// Una llamada a Mercado Libre a la vez por tienda, con espera ante el 429. Lo usa el trabajo de fichas, que
/// hace muchas lecturas seguidas: de a una no se pisa con el resto de la integración, y si ML limita se espera
/// <b>adentro del mismo turno</b>, así ningún otro pedido de la tienda se cuela mientras tanto.
/// Singleton: el estado vive en memoria (la API corre en una sola instancia).
/// </summary>
public sealed class MeliTenantGate(MeliWait wait)
{
    /// <summary>Esperas de 1, 2, 4, 8 y 16 segundos.</summary>
    public const int Max429Retries = 5;

    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _locks = new();

    public async Task<T> RunAsync<T>(Guid tenantId, Func<CancellationToken, Task<T>> call, CancellationToken ct)
    {
        var gate = _locks.GetOrAdd(tenantId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            for (var retry = 0; ; retry++)
            {
                try
                {
                    return await call(ct);
                }
                catch (MeliException ex) when (ex.Status == HttpStatusCode.TooManyRequests)
                {
                    if (retry >= Max429Retries)
                        throw new MeliBusyException("Mercado Libre está limitando el tráfico; se sigue en un rato.");
                    await wait(TimeSpan.FromSeconds(1 << retry), ct);
                }
            }
        }
        finally
        {
            gate.Release();
        }
    }
}
