using System.Xml.Linq;

namespace Fiscal.Infrastructure;

/// <summary>Parseo del faultstring de un SOAP Fault de ARCA (WSAA/WSFEv1).</summary>
internal static class SoapFault
{
    public static string Extract(string body)
    {
        try
        {
            var s = XDocument.Parse(body).Descendants().FirstOrDefault(e => e.Name.LocalName == "faultstring")?.Value;
            return string.IsNullOrWhiteSpace(s) ? "(sin detalle)" : s.Trim();
        }
        catch { return "(sin detalle)"; }
    }
}

/// <summary>
/// Clave estable (bigint) para pg_advisory_xact_lock sobre una clave lógica.
/// FNV-1a de 64 bits: determinístico entre procesos y reinicios.
/// </summary>
internal static class AdvisoryLock
{
    public static long KeyFor(string logicalKey)
    {
        ulong hash = 14695981039346656037UL;
        foreach (var c in logicalKey) { hash ^= c; hash *= 1099511628211UL; }
        return unchecked((long)hash);
    }
}
