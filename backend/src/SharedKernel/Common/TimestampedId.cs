namespace SharedKernel.Common;

/// <summary>
/// Formato "guid|unixSeconds" de los states OAuth firmados: un id con
/// timestamp de emisión y vencimiento. El cifrado (DataProtection) lo aporta
/// cada protector; acá vive solo el formato y su validación, que estaba
/// copiado en los protectors de Payments y de la API.
/// </summary>
public static class TimestampedId
{
    public static string Format(Guid id) => $"{id:N}|{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";

    /// <summary>null si el formato es inválido o el timestamp superó maxAge.</summary>
    public static Guid? TryParse(string raw, TimeSpan maxAge)
    {
        var parts = raw.Split('|');
        if (parts.Length != 2) return null;
        var issuedAt = DateTimeOffset.FromUnixTimeSeconds(long.Parse(parts[1]));
        if (DateTimeOffset.UtcNow - issuedAt > maxAge) return null;
        return Guid.ParseExact(parts[0], "N");
    }
}
