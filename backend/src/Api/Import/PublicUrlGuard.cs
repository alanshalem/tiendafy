using System.Net;
using System.Net.Sockets;

namespace Api.Import;

/// <summary>
/// Defensa anti-SSRF para lo que el servidor descarga de una URL que eligió
/// otro (las imágenes del CSV de importación): solo http(s) y solo si el host
/// resuelve a direcciones públicas. Sin esto, una fila con
/// <c>http://169.254.169.254/…</c> le haría leer al servidor sus propias
/// credenciales de la nube.
/// </summary>
public static class PublicUrlGuard
{
    /// <summary>Cliente HTTP para descargar URLs ajenas (ver <see cref="CreateHandler"/>).</summary>
    public const string HttpClientName = "public-fetch";

    /// <summary>
    /// El handler de ese cliente. Revisar la URL antes de pedirla no alcanza:
    /// una URL pública puede responder un 302 a la red interna, y el DNS puede
    /// cambiar entre el chequeo y la conexión (DNS rebinding). Por eso no sigue
    /// redirecciones y vuelve a validar la IP en el momento de conectar.
    /// </summary>
    public static SocketsHttpHandler CreateHandler() => new()
    {
        AllowAutoRedirect = false,
        ConnectCallback = (context, ct) => ConnectToPublicAsync(context.DnsEndPoint, ct),
    };

    /// <summary>Conecta solo si el host resuelve, entero, a direcciones públicas.</summary>
    public static async ValueTask<Stream> ConnectToPublicAsync(DnsEndPoint endpoint, CancellationToken ct)
    {
        var addresses = await Dns.GetHostAddressesAsync(endpoint.Host, ct);
        if (addresses.Length == 0 || addresses.Any(IsPrivateOrReserved))
            throw new HttpRequestException($"{endpoint.Host} no resuelve a una dirección pública.");

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(addresses, endpoint.Port, ct);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    /// <summary>¿Se puede descargar? http(s) y todas sus IPs públicas.</summary>
    public static async Task<bool> IsFetchableAsync(string url, CancellationToken ct)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        try
        {
            var addresses = await Dns.GetHostAddressesAsync(u.DnsSafeHost, ct);
            return addresses.Length > 0 && !addresses.Any(IsPrivateOrReserved);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Loopback, redes privadas, link-local (la metadata de la nube), CGNAT,
    /// multicast y reservadas. Una IPv4 escrita como IPv6 (<c>::ffff:10.0.0.1</c>)
    /// se juzga como la IPv4 que es: antes pasaba como pública.
    /// </summary>
    public static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            return b[0] == 0                                   // 0.0.0.0/8
                || b[0] == 10                                  // 10/8
                || (b[0] == 100 && b[1] >= 64 && b[1] <= 127)  // 100.64/10 CGNAT
                || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)   // 172.16/12
                || (b[0] == 192 && b[1] == 168)                // 192.168/16
                || (b[0] == 169 && b[1] == 254)                // 169.254/16 link-local (cloud metadata)
                || b[0] == 127                                 // loopback
                || b[0] >= 224;                                // multicast/reserved
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.Equals(IPAddress.IPv6Any)) return true;    // :: (en muchos sistemas, esta máquina)
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
            var b = ip.GetAddressBytes();
            return (b[0] & 0xFE) == 0xFC;                      // fc00::/7 unique-local
        }

        return true;
    }
}
