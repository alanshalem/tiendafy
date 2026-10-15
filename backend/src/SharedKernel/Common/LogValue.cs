namespace SharedKernel.Common;

/// <summary>
/// Sanitizado de valores de origen externo antes de loguearlos:
/// - Safe: corta caracteres de control (anti log-forging: un \n inyectado no
///   puede fabricar líneas de log falsas) y limita el largo.
/// - MaskEmail: "juan.perez@gmail.com" → "j***@gmail.com" — el log conserva
///   valor de debugging sin volcar PII completa.
/// - MaskPhone: "5491123456789" → "***6789" — alcanza para ubicar un envío
///   junto con la orden, sin el teléfono del comprador entero.
/// </summary>
public static class LogValue
{
    public static string Safe(string? value, int max = 200)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var chars = value.Where(c => !char.IsControl(c)).Take(max).ToArray();
        return new string(chars);
    }

    public static string MaskEmail(string? email)
    {
        var safe = Safe(email, 254);
        var at = safe.IndexOf('@');
        if (at <= 0) return "***";
        return $"{safe[0]}***{safe[at..]}";
    }

    public static string MaskPhone(string? phone)
    {
        var digits = new string([.. (phone ?? string.Empty).Where(char.IsAsciiDigit)]);
        return digits.Length <= 6 ? "***" : $"***{digits[^4..]}";
    }
}
