using System.Text.RegularExpressions;

namespace SharedKernel.Common;

/// <summary>
/// Sanitizado de valores de origen externo antes de loguearlos:
/// - Safe: corta caracteres de control (anti log-forging: un \n inyectado no
///   puede fabricar líneas de log falsas) y limita el largo.
/// - MaskEmail: "juan.perez@gmail.com" → "***@gmail.com" — el log conserva
///   el dominio (útil para diagnosticar rebotes) sin volcar PII.
/// - Body: cuerpo de una respuesta de error de un proveedor: tapa emails,
///   números de 7+ dígitos (DNI, teléfono, tarjeta) y tokens, y lo recorta.
/// - MaskPhone: "5491123456789" → "***6789" — alcanza para ubicar un envío
///   junto con la orden, sin el teléfono del comprador entero.
/// </summary>
public static partial class LogValue
{
    [GeneratedRegex(@"(?i)Bearer\s+[A-Za-z0-9\-._~+/]+=*")]
    private static partial Regex BearerRx();

    // access_token=abc, "access_token":"abc", token: abc, client_secret=...
    [GeneratedRegex("""(?i)(["']?(?:access_token|refresh_token|client_secret|api_key|apikey|token|secret|password|authorization)["']?\s*[:=]\s*["']?(?:Bearer\s+)?)[^\s"',&}]+""")]
    private static partial Regex KeyValueSecretRx();

    [GeneratedRegex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")]
    private static partial Regex EmailRx();

    [GeneratedRegex(@"\d(?:[\s.\-]?\d){6,}")]
    private static partial Regex LongNumberRx();

    /// <summary>
    /// Cuerpo de respuesta de un proveedor listo para loguear: sin datos
    /// personales ni tokens, sin saltos de línea y recortado a <paramref name="max"/>.
    /// Conserva el código de error y el mensaje, que es lo que sirve para diagnosticar.
    /// </summary>
    public static string Body(string? body, int max = 500)
    {
        if (string.IsNullOrWhiteSpace(body)) return string.Empty;
        var s = KeyValueSecretRx().Replace(body, "$1***");
        s = BearerRx().Replace(s, "Bearer ***");
        s = EmailRx().Replace(s, "***@***");
        s = LongNumberRx().Replace(s, "***");
        s = Safe(s, max);
        return s;
    }

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
        return $"***{safe[at..]}";
    }

    public static string MaskPhone(string? phone)
    {
        var digits = new string([.. (phone ?? string.Empty).Where(char.IsAsciiDigit)]);
        return digits.Length <= 6 ? "***" : $"***{digits[^4..]}";
    }
}
