using System.Globalization;
using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>Un aviso para el panel sobre el borrador. <c>Code</c>: contact-data, link, amount, too-long o delivery-date.</summary>
public sealed record DraftWarning(string Code, string Message);

/// <summary>
/// Lo que sabemos del pedido o la publicación para contrastar el borrador. <c>KnownReferences</c>: números de
/// pedido, envío o seguimiento que conoce nuestro código; nombrarlos no es dar un dato de contacto.
/// </summary>
public sealed record DraftFacts(
    int MaxLength, IReadOnlyCollection<long> KnownAmountsMinor, bool DeliveryEstimateKnown, IReadOnlyCollection<string> KnownReferences);

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

        if (Safe(() => LinkPattern().IsMatch(draft)))
        {
            warnings.Add(new("link", "El borrador incluye un link. Revisá que sea correcto antes de enviarlo."));
        }

        if (draft.Contains(PiiRedactor.Mask, StringComparison.Ordinal))
        {
            warnings.Add(new("contact-data", "El borrador copió un dato oculto del comprador."));
        }

        // Un número de pedido o de seguimiento que conoce nuestro código no es un dato del comprador.
        var withoutReferences = WithoutReferences(draft, facts.KnownReferences);
        if (Safe(() => PiiRedactor.ContainsContactData(withoutReferences)) || Safe(() => SocialHandlePattern().IsMatch(draft)))
        {
            warnings.Add(new("contact-data", "El borrador tiene datos de contacto o un número que parece personal."));
        }

        warnings.AddRange(CheckAmounts(draft, facts.KnownAmountsMinor));

        if (draft.Length > facts.MaxLength)
        {
            warnings.Add(new("too-long", $"El borrador tiene {draft.Length} caracteres y el máximo es {facts.MaxLength}."));
        }

        if (!facts.DeliveryEstimateKnown && (HasStrongDeliveryPromise(draft) || HasWeakDeliveryPromise(draft)))
        {
            warnings.Add(new("delivery-date", "El borrador promete una fecha de entrega y no hay un seguimiento que la respalde."));
        }

        return warnings;
    }

    /// <summary>Por debajo de este largo una referencia no se saca: partiría un teléfono que la contiene ("11 1001 2345").</summary>
    private const int MinReferenceLength = 6;

    /// <summary>
    /// Saca del texto cada referencia conocida que aparezca como palabra entera (no dentro de otro número o
    /// código), para que el chequeo de datos de contacto no la tome por un teléfono o un documento.
    /// </summary>
    private static string WithoutReferences(string draft, IReadOnlyCollection<string> references)
    {
        foreach (var reference in references.Where(r => r.Trim().Length >= MinReferenceLength).OrderByDescending(r => r.Length))
        {
            draft = Regex.Replace(draft, $@"(?<![\w-]){Regex.Escape(reference.Trim())}(?![\w-])", "#",
                RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(250));
        }
        return draft;
    }

    private static IEnumerable<DraftWarning> CheckAmounts(string draft, IReadOnlyCollection<long> known)
    {
        var knownText = string.Join(" o ", known.Distinct().Order().Select(FormatMinor));
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
        MatchCollection matches;
        try
        {
            matches = AmountPattern().Matches(draft);
            _ = matches.Count;
        }
        catch (RegexMatchTimeoutException)
        {
            yield break;
        }

        foreach (Match m in matches)
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
    [GeneratedRegex(@"\$\s*(?<a>" + AmountNumber + @")|(?<![\d.,])(?<b>" + AmountNumber + @")\s*pesos\b", RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex AmountPattern();

    [GeneratedRegex(@"https?://\S+|\bwww\.\S+|(?<![@\w.-])[a-z][\w-]*\.[a-z]{2,}(?:\.[a-z]{2})?/\S+|(?<![@\w.-])[a-z][\w-]*(?:\.[\w-]+)*\.(?-i:com|net|org|ar|app|shop|store|me|ly|io|co|ee|gl|link|info|xyz)\b(?!@)", RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex LinkPattern();

    // @usuario, o una red social seguida de un usuario (@x, con ":" o con algún número/guion bajo/punto) o un teléfono
    [GeneratedRegex(
        @"(?<![\w.@])@[\w.]{3,}|\b(?:instagram|insta|whatsapp|wsp|telegram)\b(?:\s*:\s*[\w.]{3,}|\s+(?:es\s+)?(?:@[\w.]{3,}|\+?\d[\d\s-]{5,}|[\w]*[\d_.][\w.]*))",
        RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex SocialHandlePattern();

    private static bool HasStrongDeliveryPromise(string draft) => Safe(() => StrongDeliveryPattern().IsMatch(draft));

    private static bool HasWeakDeliveryPromise(string draft) =>
        Safe(() => SentenceSplit().Split(draft).Any(sentence =>
            WeakDeliveryPattern().IsMatch(sentence) && DeliveryVerbPattern().IsMatch(sentence)));

    // Un patrón que se pasa del tiempo cuenta como "sin coincidencia": un aviso de menos es mejor que un 500.
    private static bool Safe(Func<bool> match)
    {
        try
        {
            return match();
        }
        catch (RegexMatchTimeoutException)
        {
            return false;
        }
    }

    // Fuertes: avisan solas.
    [GeneratedRegex(
        @"\b(?:en|dentro\s+de)\s+\d+\s*(?:d[ií]as?|horas?|hs?)\b|\b\d+\s*(?:y|a|o|-)\s*\d+\s*d[ií]as\b|\bd[ií]as\s+h[aá]biles\b|\besta\s+semana\b|\bla\s+semana\s+(?:que\s+viene|pr[oó]xima)\b|\ba\s+fin\s+de\s+mes\b|\bel\s+\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b|\bpasado\s+ma[ñn]ana\b|\b(?:24|48|72|96)\s*(?:hs|horas)\b",
        RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex StrongDeliveryPattern();

    // Débiles: avisan solo con un verbo de entrega en la misma oración.
    [GeneratedRegex(
        @"\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[ñn]ana|hoy)\b|(?<![\d/])(?:0?[1-9]|[12]\d|3[01])/(?:0?[1-9]|1[0-2])(?![\d/])",
        RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex WeakDeliveryPattern();

    [GeneratedRegex(@"\b(?:lleg|recib|entreg|despach|envi|mand)\w*|\bsal(?:e|dr)\w*", RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 250)]
    private static partial Regex DeliveryVerbPattern();

    [GeneratedRegex(@"[.!?;\n]+")]
    private static partial Regex SentenceSplit();
}
