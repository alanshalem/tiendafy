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
    /// Revisión sin red, para URLs que no se van a descargar pero sí a guardar
    /// como link: http(s), sin usuario ni contraseña y, si el host es una IP
    /// escrita, que no sea privada. (Un nombre se guarda sin resolver.)
    /// </summary>
    public static bool IsPlausiblyPublic(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        if (u.UserInfo.Length > 0) return false;
        if (u.HostNameType is UriHostNameType.IPv4 or UriHostNameType.IPv6)
            return IPAddress.TryParse(u.DnsSafeHost, out var ip) && !IsPrivateOrReserved(ip);
        return !u.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);
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
                || (b[0] == 198 && (b[1] & 0xFE) == 18)        // 198.18/15 benchmarking
                || (b[0] == 192 && b[1] == 0 && b[2] == 0)     // 192.0.0/24 protocolos IETF
                || (b[0] == 169 && b[1] == 254)                // 169.254/16 link-local (cloud metadata)
                || b[0] == 127                                 // loopback
                || b[0] >= 224;                                // multicast/reserved
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.Equals(IPAddress.IPv6Any)) return true;    // :: (en muchos sistemas, esta máquina)
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
            var b = ip.GetAddressBytes();
            if ((b[0] & 0xFE) == 0xFC) return true;            // fc00::/7 unique-local

            // Prefijos de traducción que llevan una IPv4 adentro: con un NAT64
            // en la red, apuntan a la IPv4 embebida (la metadata de la nube, por
            // ejemplo), así que se juzgan por ella.
            if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B)
            {
                // 64:ff9b::/96 (NAT64 estándar): IPv4 en los últimos 4 bytes.
                var standard = b[4..12].All(x => x == 0);
                // 64:ff9b:1::/48 es de uso local de cada red: no se puede saber qué hay detrás.
                return !standard || IsPrivateOrReserved(new IPAddress(b[12..16]));
            }
            if (b[0] == 0x20 && b[1] == 0x02)                  // 2002::/16 (6to4): IPv4 en los bytes 2-5
                return IsPrivateOrReserved(new IPAddress(b[2..6]));
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0 && b[3] == 0)
                return true;                                   // 2001::/32 (Teredo): obsoleto, túnel hacia cualquier lado
            if (b[..12].All(x => x == 0))                      // ::a.b.c.d (IPv4 compatible, en desuso)
                return IsPrivateOrReserved(new IPAddress(b[12..16]));
            return false;
        }

        return true;
    }
}
