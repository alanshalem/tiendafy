using System.Globalization;
using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>Un aviso para el panel sobre el borrador. <c>Code</c>: contact-data, link, amount, too-long o delivery-date.</summary>
public sealed record DraftWarning(string Code, string Message);

/// <summary>Lo que sabemos del pedido o la publicación para contrastar el borrador.</summary>
public sealed record DraftFacts(int MaxLength, IReadOnlyCollection<long> KnownAmountsMinor, bool DeliveryEstimateKnown);

public static class DraftLimits
{
    public static int MaxLength(DraftChannel c) => c switch
    {
        DraftChannel.MeliMessage => 350,
        _ => 2000,
    };
}

/// <summary>
/// Avisos deterministas sobre el borrador que escribió el modelo. Solo detectan: el texto nunca se modifica.
/// </summary>
public static partial class DraftGuardrails
{
    public static IReadOnlyList<DraftWarning> Check(string draft, DraftFacts facts)
    {
        var warnings = new List<DraftWarning>();
        draft ??= string.Empty;

        if (LinkPattern().IsMatch(draft))
        {
            warnings.Add(new("link", "El borrador incluye un link. Revisá que sea correcto antes de enviarlo."));
        }

        if (PiiRedactor.ContainsContactData(draft))
        {
            warnings.Add(new("contact-data", "El borrador incluye un mail o un teléfono. Sacalo: no se pueden pasar datos de contacto."));
        }

        warnings.AddRange(CheckAmounts(draft, facts.KnownAmountsMinor));

        if (draft.Length > facts.MaxLength)
        {
            warnings.Add(new("too-long", $"El borrador tiene {draft.Length} caracteres y el máximo es {facts.MaxLength}."));
        }

        if (!facts.DeliveryEstimateKnown && DeliveryPromisePattern().IsMatch(draft))
        {
            warnings.Add(new("delivery-date", "El borrador promete una fecha de entrega y no hay un seguimiento que la respalde."));
        }

        return warnings;
    }

    private static IEnumerable<DraftWarning> CheckAmounts(string draft, IReadOnlyCollection<long> known)
    {
        var knownText = string.Join(" o ", known.Select(FormatMinor));
        foreach (var minor in AmountsIn(draft).Distinct())
        {
            if (known.Contains(minor))
            {
                continue;
            }

            yield return new("amount", known.Count == 0
                ? $"El borrador menciona {FormatMinor(minor)} y no hay un precio conocido para contrastarlo."
                : $"El borrador menciona {FormatMinor(minor)} y el precio real es {knownText}.");
        }
    }

    private static IEnumerable<long> AmountsIn(string draft)
    {
        foreach (Match m in AmountPattern().Matches(draft))
        {
            var raw = m.Groups["a"].Success ? m.Groups["a"].Value : m.Groups["b"].Value;
            var normalized = raw.Replace(".", string.Empty).Replace(',', '.');
            if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
            {
                yield return (long)Math.Round(value * 100m, MidpointRounding.AwayFromZero);
            }
        }
    }

    private static string FormatMinor(long minor) =>
        "$ " + ArgentineNumbers.Number(minor / 100m, minor % 100 == 0 ? 0 : 2);

    private const string AmountNumber = @"(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?";

    // "$ 15.000", "$15.000,50", "14.000 pesos"
    [GeneratedRegex(@"\$\s*(?<a>" + AmountNumber + @")|(?<![\d.,])(?<b>" + AmountNumber + @")\s*pesos\b", RegexOptions.IgnoreCase)]
    private static partial Regex AmountPattern();

    [GeneratedRegex(@"https?://\S+|\bwww\.\S+|(?<![@\w.-])[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|ar|app|shop|store)\b(?!@)", RegexOptions.IgnoreCase)]
    private static partial Regex LinkPattern();

    // "te llega el…", "sale el…", día de la semana, mañana, "en 3 días", 12/10
    [GeneratedRegex(
        @"\b(?:te\s+lleg(?:a|aría|aria)|lleg(?:aría|aria)|sale)\s+(?:el|mañana|hoy|en)\b|\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|mañana)\b|\ben\s+\d+\s+(?:d[ií]as?|horas?|hs)\b|(?<![\d/])\d{1,2}/\d{1,2}(?![\d/])",
        RegexOptions.IgnoreCase)]
    private static partial Regex DeliveryPromisePattern();
}
