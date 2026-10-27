using System.Net;
using Api.Startup;

namespace Api.Shop;

/// <summary>
/// Cuántas compras con stock reservado puede tener abiertas a la vez un mismo
/// cliente (su IP; en IPv6, su /64, ver <see cref="TrustedNetworks.ClientKey"/>).
///
/// <para>
/// El cupo de pedidos por IP frena la cantidad de envíos, pero cada envío
/// reserva hasta 99 unidades por línea durante media hora: con pocas IP, un
/// script dejaba sin stock vendible las variantes de poco stock de una tienda.
/// Con este tope, la compra que pasa el máximo responde 429 hasta que alguna
/// de las anteriores venza.
/// </para>
///
/// <para>
/// En memoria: la API corre en una sola réplica, y lo que se pierde al
/// reiniciar son lugares tomados, nunca stock. Un lugar se libera cuando vence
/// la reserva de esa compra (<c>CheckoutSession.ExpiresAtUtc</c>); una compra
/// que se paga antes lo sigue ocupando hasta entonces. Nuestros servidores por
/// la red interna no tienen tope (son todos los compradores juntos).
/// </para>
/// </summary>
public sealed class CheckoutReservationQuota(int limit, IReadOnlyList<IPNetwork> internalNetworks, TimeProvider clock)
{
    /// <summary>El tope de fábrica: compras con reserva viva por cliente.</summary>
    public const int DefaultLimit = 5;

    // Con más clientes que esto se barren todos los vencidos en la próxima toma.
    private const int SweepAbove = 10_000;

    private readonly Dictionary<string, Dictionary<Guid, DateTime>> _byClient = new(StringComparer.Ordinal);
    private readonly Lock _gate = new();

    public int Limit => limit;

    /// <summary>A quién se le cuenta la compra; null si el pedido viene de nuestra red interna.</summary>
    public string? ClientOf(HttpContext http)
    {
        var ip = http.Connection.RemoteIpAddress;
        return TrustedNetworks.Contains(internalNetworks, ip) ? null : TrustedNetworks.ClientKey(ip);
    }

    /// <summary>
    /// Toma un lugar para la compra hasta <paramref name="untilUtc"/>. Si ya
    /// tenía uno (un reintento de la misma compra), lo renueva. False: el
    /// cliente ya tiene el máximo, y <paramref name="retryAfter"/> dice cuándo
    /// se libera el primero.
    /// </summary>
    public bool TryTake(string client, Guid sessionId, DateTime untilUtc, out TimeSpan retryAfter)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        retryAfter = TimeSpan.Zero;
        lock (_gate)
        {
            if (_byClient.Count > SweepAbove) SweepAll(now);

            if (!_byClient.TryGetValue(client, out var sessions))
                _byClient[client] = sessions = [];
            Prune(sessions, now);

            if (!sessions.ContainsKey(sessionId) && sessions.Count >= limit)
            {
                retryAfter = sessions.Values.Min() - now;
                return false;
            }
            sessions[sessionId] = untilUtc;
            return true;
        }
    }

    /// <summary>Devuelve el lugar: la compra no llegó a reservar nada.</summary>
    public void Release(string client, Guid sessionId)
    {
        lock (_gate)
        {
            if (!_byClient.TryGetValue(client, out var sessions)) return;
            sessions.Remove(sessionId);
            if (sessions.Count == 0) _byClient.Remove(client);
        }
    }

    private static void Prune(Dictionary<Guid, DateTime> sessions, DateTime now)
    {
        foreach (var (id, until) in sessions.ToList())
            if (until <= now) sessions.Remove(id);
    }

    private void SweepAll(DateTime now)
    {
        foreach (var (client, sessions) in _byClient.ToList())
        {
            Prune(sessions, now);
            if (sessions.Count == 0) _byClient.Remove(client);
        }
    }
}
