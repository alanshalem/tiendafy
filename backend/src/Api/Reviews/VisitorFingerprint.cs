using System.Security.Cryptography;
using System.Text;

namespace Api.Reviews;

/// <summary>
/// Una huella anónima del visitante (IP + navegador, por tienda) para que un
/// "me sirvió" o una denuncia cuenten una vez por persona. Se guarda el hash,
/// nunca la IP: alcanza para deduplicar y no es un dato personal que haya que
/// cuidar.
///
/// <para>
/// No es infalible (cambiar de red cambia la huella), y no pretende serlo:
/// junto con el límite por IP, sube el costo de inflar o hundir una reseña lo
/// suficiente para que no valga la pena.
/// </para>
/// </summary>
public static class VisitorFingerprint
{
    public static string Of(HttpContext http, Guid tenantId)
    {
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "sin-ip";
        var agent = http.Request.Headers.UserAgent.ToString();
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{tenantId:N}|{ip}|{agent}"));
        return Convert.ToHexStringLower(bytes);
    }
}
