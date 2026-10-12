using System.Net;
using System.Threading.RateLimiting;

namespace Api.Startup;

/// <summary>
/// Las redes de nuestros propios servidores —Caddy y los contenedores del
/// stack— según <c>ForwardedHeaders:KnownNetworks</c>.
///
/// <para>
/// Sirven para dos cosas. Confiar en el <c>X-Forwarded-For</c> que pone Caddy
/// (sin eso, todo el tráfico parece venir de Caddy y los límites por IP se
/// comparten entre todos los usuarios de la plataforma). Y reconocer los
/// pedidos que hace el storefront al armar una página: llegan por la red
/// interna sin <c>X-Forwarded-For</c>, y no son un cliente sino todos los
/// compradores de todas las tiendas juntos.
/// </para>
/// </summary>
public static class TrustedNetworks
{
    /// <summary>Las redes configuradas; un CIDR mal escrito se ignora.</summary>
    public static IReadOnlyList<IPNetwork> From(IConfiguration? configuration)
    {
        var networks = new List<IPNetwork>();
        foreach (var cidr in configuration?.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
            if (IPNetwork.TryParse(cidr, out var network))
                networks.Add(network);
        return networks;
    }

    /// <summary>¿La dirección es de una red nuestra? (Una IPv4 escrita como IPv6 cuenta como IPv4.)</summary>
    public static bool Contains(IReadOnlyList<IPNetwork> networks, IPAddress? address)
    {
        if (address is null) return false;
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        return networks.Any(n => n.Contains(address));
    }

    /// <summary>
    /// La partición del techo global de pedidos: por IP del cliente, salvo
    /// nuestros servidores hablando por la red interna, que no tienen techo.
    /// </summary>
    public static RateLimitPartition<string> GlobalPartition(
        HttpContext context, IReadOnlyList<IPNetwork> internalNetworks, int permitLimit)
    {
        var ip = context.Connection.RemoteIpAddress;
        if (Contains(internalNetworks, ip))
            return RateLimitPartition.GetNoLimiter("internal");

        return RateLimitPartition.GetFixedWindowLimiter(
            ip?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
    }
}
