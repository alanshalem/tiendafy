using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Purchasing.Infrastructure;

namespace Api.Purchasing;

public enum LineMatchMethod { Code, Description, Ai, None }

/// <summary>Un ítem de la orden tal como lo ve el emparejador. <paramref name="Label"/> = producto + variante.</summary>
public sealed record OrderItemRef(Guid VariantId, string Sku, string Label);

/// <param name="Confidence">"alta", "media" o "baja".</param>
public sealed record InvoiceLineMatch(
    int LineIndex, Guid? VariantId, LineMatchMethod Method, string Confidence, IReadOnlyList<Guid> Candidates);

/// <param name="AskAi">Índices de las líneas ambiguas que se le preguntan al modelo (hasta 20, en orden).</param>
public sealed record MatchPlan(IReadOnlyList<InvoiceLineMatch> Matches, IReadOnlyList<int> AskAi);

/// <summary>
/// Empareja las líneas de la factura con los ítems de la orden, en código y sin IA: primero por código
/// (el SKU propio), después por parecido de descripción (Sørensen–Dice sobre palabras normalizadas). Lo que
/// no se decide con claridad queda como ambiguo, con sus candidatos, para que el modelo elija entre ellos.
/// </summary>
public static partial class InvoiceLineMatcher
{
    /// <summary>Con este puntaje y la ventaja mínima sobre el segundo, se acepta sin IA.</summary>
    public const decimal AcceptScore = 0.80m;
    public const decimal MinMargin = 0.15m;

    /// <summary>Por debajo de esto no hay parecido: un flete, un recargo. No se le pregunta a nadie.</summary>
    public const decimal MinScore = 0.30m;

    /// <summary>Con este puntaje o más, un emparejamiento por descripción es de confianza alta.</summary>
    public const decimal HighScore = 0.90m;

    public const int MaxAskAi = 20;
    public const int MaxCandidates = 5;

    public static IReadOnlyList<OrderItemRef> ItemsOf(PurchaseOrder order) =>
        [.. order.Items.Select(i => new OrderItemRef(i.VariantId, i.Sku, $"{i.ProductName} {i.VariantDescription}".Trim()))];

    /// <summary>Minúsculas, sin tildes, solo [a-z0-9] y espacios, cortado entre dígito y letra ("10kg" → "10 kg").</summary>
    public static string Normalize(string text)
    {
        var decomposed = text.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(char.IsAsciiLetterOrDigit(c) ? c : ' ');
        }

        var clean = DigitLetterBoundary().Replace(sb.ToString(), " ");
        return Spaces().Replace(clean, " ").Trim();
    }

    /// <summary>Mayúsculas y solo [A-Z0-9]: "rem 001" y "REM-001" son el mismo código.</summary>
    public static string NormalizeCode(string code) =>
        new([.. code.ToUpperInvariant().Where(char.IsAsciiLetterOrDigit)]);

    /// <summary>Dice: 2·|A∩B| / (|A|+|B|) sobre las palabras normalizadas. 0 si alguno queda vacío.</summary>
    public static decimal Similarity(string a, string b) => Dice(Tokens(a), Tokens(b));

    public static MatchPlan Plan(IReadOnlyList<ScannedInvoiceLine> lines, IReadOnlyList<OrderItemRef> items)
    {
        var skus = items.Select(i => NormalizeCode(i.Sku)).ToList();
        var labels = items.Select(i => Tokens(i.Label)).ToList();
        var matches = new List<InvoiceLineMatch>(lines.Count);
        var ask = new List<int>();

        for (var index = 0; index < lines.Count; index++)
        {
            var line = lines[index];

            if (MatchByCode(line, skus) is { } byCode)
            {
                matches.Add(new InvoiceLineMatch(index, items[byCode].VariantId, LineMatchMethod.Code, "alta", []));
                continue;
            }

            var lineTokens = Tokens(line.Description);
            var scored = labels
                .Select((tokens, i) => (Index: i, Score: Dice(lineTokens, tokens)))
                .OrderByDescending(s => s.Score)
                .ToList();
            var best = scored.Count > 0 ? scored[0] : default;
            var second = scored.Count > 1 ? scored[1].Score : 0m;

            if (scored.Count > 0 && best.Score >= AcceptScore && best.Score - second >= MinMargin)
            {
                matches.Add(new InvoiceLineMatch(
                    index, items[best.Index].VariantId, LineMatchMethod.Description,
                    best.Score >= HighScore ? "alta" : "media", []));
                continue;
            }

            if (scored.Count == 0 || best.Score < MinScore)
            {
                matches.Add(new InvoiceLineMatch(index, null, LineMatchMethod.None, "baja", []));
                continue;
            }

            // Ambigua: se queda sin emparejar con sus candidatos; solo las primeras 20 van a la IA.
            var candidates = scored.Where(s => s.Score >= MinScore).Take(MaxCandidates)
                .Select(s => items[s.Index].VariantId).ToList();
            matches.Add(new InvoiceLineMatch(index, null, LineMatchMethod.None, "baja", candidates));
            if (ask.Count < MaxAskAi) ask.Add(index);
        }

        return new MatchPlan(matches, ask);
    }

    private static int? MatchByCode(ScannedInvoiceLine line, List<string> skus)
    {
        if (line.Code is { } code)
        {
            var normalized = NormalizeCode(code);
            if (normalized.Length > 0 && skus.IndexOf(normalized) is var i and >= 0) return i;
        }
        else
        {
            // Sin columna de código, algunos proveedores ponen el SKU dentro de la descripción.
            foreach (var word in CodeSeparators().Split(line.Description))
            {
                var normalized = NormalizeCode(word);
                if (normalized.Length >= 4 && skus.IndexOf(normalized) is var i and >= 0) return i;
            }
        }

        return null;
    }

    private static HashSet<string> Tokens(string text) =>
        [.. Normalize(text).Split(' ', StringSplitOptions.RemoveEmptyEntries)];

    private static decimal Dice(HashSet<string> a, HashSet<string> b) =>
        a.Count == 0 || b.Count == 0 ? 0m : 2m * a.Intersect(b).Count() / (a.Count + b.Count);

    [GeneratedRegex(@"(?<=[0-9])(?=[a-z])|(?<=[a-z])(?=[0-9])")]
    private static partial Regex DigitLetterBoundary();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"[\s,;:()\[\]/|]+")]
    private static partial Regex CodeSeparators();
}
