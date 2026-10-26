using System.Text.RegularExpressions;

namespace Api.Ai.Questions;

/// <summary>
/// Tapa los datos personales del texto de un comprador antes de que llegue a un modelo:
/// mails, teléfonos, DNI y CUIT/CUIL. Un monto (<c>$ 1.250.000</c>, "1250000 pesos") no se toca.
/// </summary>
public static partial class PiiRedactor
{
    public const string Mask = "[dato oculto]";

    public static string Redact(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return text;
        }

        var result = EmailPattern().Replace(text, Mask);
        result = DottedCuitPattern().Replace(result, m => IsAmount(result, m) ? m.Value : Mask);
        result = DottedPhonePattern().Replace(result, Mask);
        result = DottedDniPattern().Replace(result, m => IsAmount(result, m) ? m.Value : Mask);
        result = DigitRunPattern().Replace(result, m => ShouldMask(result, m) ? Mask : m.Value);
        return result;
    }

    /// <summary>¿El texto trae un mail, teléfono, DNI o CUIT? Mismo criterio que <see cref="Redact"/>.</summary>
    internal static bool ContainsContactData(string text) => !string.IsNullOrEmpty(text) && Redact(text) != text;

    // Una corrida de dígitos, con espacios o guiones sueltos entre medio. Se evalúa entera
    // (nunca por pedazos) para que un CUIT de 11 dígitos no quede a medias tapado.
    private static bool ShouldMask(string text, Match m)
    {
        // Con 10 o más dígitos ya no es un monto: el "$" o el "pesos" de al lado no lo salvan.
        var digits = m.Value.Count(char.IsDigit);
        if (digits >= 10)
        {
            return true;
        }

        return digits is 7 or 8 && !m.Value.Any(char.IsWhiteSpace) && !IsAmount(text, m);
    }

    private static bool IsAmount(string text, Match m)
    {
        var before = text.AsSpan(0, m.Index).TrimEnd();
        if (before.EndsWith("$", StringComparison.Ordinal))
        {
            return true;
        }

        return PesosPattern().IsMatch(text.AsSpan(m.Index + m.Length));
    }

    // juan@gmail.com, "juan @gmail.com", "juan arroba gmail punto com"
    [GeneratedRegex(@"[\w.+-]+(?:\s*@\s*|\s+arroba\s+)[\w-]+(?:(?:\.|\s+punto\s+)[\w-]+)+", RegexOptions.IgnoreCase)]
    private static partial Regex EmailPattern();

    // 11.5555.1234
    [GeneratedRegex(@"(?<![\d.,])\d{2,3}\.\d{4}\.\d{4}(?![\d.,]?\d)")]
    private static partial Regex DottedPhonePattern();

    // 20-30.123.456-7
    [GeneratedRegex(@"(?<!\d)\d{2}-?\d{1,2}\.\d{3}\.\d{3}-?\d(?![\d.,]?\d)")]
    private static partial Regex DottedCuitPattern();

    // 30.123.456
    [GeneratedRegex(@"(?<![\d.,])\d{2}\.\d{3}\.\d{3}(?![\d.,]?\d)")]
    private static partial Regex DottedDniPattern();

    [GeneratedRegex(@"(?<!\d|\d[.,])\+?\d(?:[\s-]?\d)*(?![.,]?\d)")]
    private static partial Regex DigitRunPattern();

    [GeneratedRegex(@"^\s*pesos\b", RegexOptions.IgnoreCase)]
    private static partial Regex PesosPattern();
}
