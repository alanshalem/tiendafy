using System.Globalization;
using System.Text.RegularExpressions;
using Api.Meli;

namespace Api.Ai.Catalog;

/// <summary>
/// El gate determinista entre la redacción y el evaluador: funciones puras, sin IA. Lo que no cumple es una
/// violación (texto en castellano que después se usa como crítica para reintentar). Lo único que no es
/// violación es un identificador que no está textual en los datos del producto: se vuelve <c>falta_dato</c>
/// y queda para completar a mano, porque inventarlo es lo que más daño hace en Mercado Libre.
/// </summary>
public static class AiCatalogGate
{
    public const int DescriptionMin = 200, DescriptionMax = 3_000, SeoTitleMax = 60, SeoDescriptionMin = 70, SeoDescriptionMax = 160;

    private static readonly Regex Email = new(@"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex Link = new(
        @"https?://|\bwww\.|\b[a-z0-9-]+\.(?:com\.ar|com|net|org)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex Price = new(
        @"US\$|\$\s*\d|\d\s*\$|\d[\d.,]*\s*(?:pesos|d[óo]lares)\b|\b(?:ARS|USD)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex NumberOnly = new(@"^\s*(-?\d+(?:[.,]\d+)?)\s*$", RegexOptions.Compiled);

    private static readonly Regex NumberWithUnit = new(@"^\s*(-?\d+(?:[.,]\d+)?)\s*(\S.*?)?\s*$", RegexOptions.Compiled);

    private static readonly HashSet<string> GtinIds = new(StringComparer.OrdinalIgnoreCase) { "GTIN", "EAN", "UPC" };

    /// <summary>Salida del modelo: todas las reglas. <paramref name="sourceText"/> es lo que cuenta como "textual".</summary>
    public static AiCatalogGateResult Check(AiCatalogProposal proposal, IReadOnlyList<MeliCategoryAttribute> asked, string sourceText)
    {
        var violations = new List<string>();
        var notes = new List<string>();

        var description = (proposal.Description ?? "").Trim();
        var seoTitle = (proposal.SeoTitle ?? "").Trim();
        var seoDescription = (proposal.SeoDescription ?? "").Trim();

        if (description.Length < DescriptionMin)
            violations.Add($"La descripción tiene {description.Length} caracteres: tiene que tener al menos {DescriptionMin}.");
        else if (description.Length > DescriptionMax)
            violations.Add($"La descripción tiene {description.Length} caracteres: tiene que tener como máximo 3.000.");

        if (seoTitle.Length == 0 || seoTitle.Length > SeoTitleMax)
            violations.Add($"El título SEO tiene {seoTitle.Length} caracteres: tiene que tener hasta {SeoTitleMax}.");

        if (seoDescription.Length is < SeoDescriptionMin or > SeoDescriptionMax)
            violations.Add($"La descripción SEO tiene {seoDescription.Length} caracteres: tiene que tener entre {SeoDescriptionMin} y {SeoDescriptionMax}.");

        CheckForbidden("La descripción", description, violations);
        CheckForbidden("El título SEO", seoTitle, violations);
        CheckForbidden("La descripción SEO", seoDescription, violations);

        var attributes = CheckAttributes(proposal.Attributes ?? [], asked, sourceText, requireTextualIdentifiers: true, violations, notes);
        return new AiCatalogGateResult(new AiCatalogProposal(description, seoTitle, seoDescription, attributes), violations, notes);
    }

    /// <summary>
    /// Edición de una persona al aprobar: atributos de la lista, valores permitidos, unidades, GTIN válido y largos
    /// máximos. No exige que un identificador esté en los datos del producto: lo tipeó ella.
    /// </summary>
    public static IReadOnlyList<string> CheckHumanEdit(
        IReadOnlyList<AiCatalogAttributeProposal> attributes, IReadOnlyList<MeliCategoryAttribute> asked,
        string? description, string? seoTitle, string? seoDescription)
    {
        var violations = new List<string>(CleanHumanAttributes(attributes, asked).Violations);
        if (description is { } d && d.Trim().Length > DescriptionMax)
            violations.Add("La descripción tiene que tener como máximo 3.000 caracteres.");
        if (seoTitle is { } t && t.Trim().Length > SeoTitleMax)
            violations.Add($"El título SEO tiene que tener hasta {SeoTitleMax} caracteres.");
        if (seoDescription is { } s && s.Trim().Length > SeoDescriptionMax)
            violations.Add($"La descripción SEO tiene que tener hasta {SeoDescriptionMax} caracteres.");
        return violations;
    }

    /// <summary>Los atributos que escribió una persona, validados y normalizados (el valor de una lista pasa a su id).</summary>
    public static (IReadOnlyList<AiCatalogAttributeProposal> Attributes, IReadOnlyList<string> Violations) CleanHumanAttributes(
        IReadOnlyList<AiCatalogAttributeProposal> attributes, IReadOnlyList<MeliCategoryAttribute> asked)
    {
        var violations = new List<string>();
        var cleaned = CheckAttributes(attributes, asked, sourceText: null, requireTextualIdentifiers: false, violations, []);
        return (cleaned, violations);
    }

    private static void CheckForbidden(string label, string text, List<string> violations)
    {
        if (Price.IsMatch(text))
            violations.Add($"{label} menciona un precio: sacá cualquier precio o moneda.");
        if (Email.IsMatch(text))
            violations.Add($"{label} tiene un mail: sacalo.");
        // Un mail también parece un dominio ("x@tienda.com"): se mira el texto sin los mails.
        if (Link.IsMatch(Email.Replace(text, " ")))
            violations.Add($"{label} tiene un link: sacalo.");
    }

    private static List<AiCatalogAttributeProposal> CheckAttributes(
        IReadOnlyList<AiCatalogAttributeProposal> proposed, IReadOnlyList<MeliCategoryAttribute> asked, string? sourceText,
        bool requireTextualIdentifiers, List<string> violations, List<string> notes)
    {
        var byId = asked.GroupBy(a => a.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var cleaned = new List<AiCatalogAttributeProposal>();

        foreach (var attribute in proposed)
        {
            var id = (attribute.Id ?? "").Trim();
            if (!byId.TryGetValue(id, out var definition))
            {
                violations.Add($"El atributo {id} no está en la lista de la categoría: sacalo.");
                continue;
            }
            if (!seen.Add(definition.Id))
            {
                violations.Add($"El atributo {definition.Name} está repetido: dejá un solo valor.");
                continue;
            }

            if (attribute.Missing || IsBlank(attribute))
            {
                cleaned.Add(new AiCatalogAttributeProposal(definition.Id, null, null, null, true));
                continue;
            }

            var (value, problem) = Normalize(definition, attribute);
            if (value is null)
            {
                violations.Add(problem!);
                cleaned.Add(new AiCatalogAttributeProposal(definition.Id, null, null, null, true));
                continue;
            }
            if (value.Note is { } note) notes.Add(note);

            if (definition.IsIdentifier)
            {
                var identifierProblem = CheckIdentifier(definition, value, sourceText, requireTextualIdentifiers);
                if (identifierProblem is not null && requireTextualIdentifiers)
                {
                    // Un identificador dudoso no es una violación: queda para completar.
                    notes.Add(identifierProblem);
                    cleaned.Add(new AiCatalogAttributeProposal(definition.Id, null, null, null, true));
                    continue;
                }
                if (identifierProblem is not null)
                {
                    violations.Add(identifierProblem);
                    cleaned.Add(new AiCatalogAttributeProposal(definition.Id, null, null, null, true));
                    continue;
                }
            }

            // Un GTIN se guarda sin espacios ni guiones, como lo pide Mercado Libre.
            var finalName = GtinIds.Contains(definition.Id) ? Gtin.Normalize(value.ValueName) : value.ValueName;
            cleaned.Add(new AiCatalogAttributeProposal(definition.Id, value.ValueId, finalName, value.Unit, false));
        }

        return cleaned;
    }

    private static bool IsBlank(AiCatalogAttributeProposal a) =>
        string.IsNullOrWhiteSpace(a.ValueId) && string.IsNullOrWhiteSpace(a.ValueName);

    private sealed record Normalized(string? ValueId, string ValueName, string? Unit, string? Note);

    /// <summary>El valor limpio según el tipo del atributo, o el problema (en castellano) si no cumple.</summary>
    private static (Normalized? Value, string? Problem) Normalize(MeliCategoryAttribute definition, AiCatalogAttributeProposal attribute)
    {
        var name = attribute.ValueName?.Trim();
        var valueId = attribute.ValueId?.Trim();
        var kind = definition.Kind == MeliAttributeKind.List && definition.Values.Count == 0 ? MeliAttributeKind.Text : definition.Kind;

        switch (kind)
        {
            case MeliAttributeKind.List:
            case MeliAttributeKind.Boolean:
                {
                    var match = definition.Values.FirstOrDefault(v =>
                            !string.IsNullOrEmpty(valueId) && string.Equals(v.Id, valueId, StringComparison.OrdinalIgnoreCase))
                        ?? definition.Values.FirstOrDefault(v =>
                            !string.IsNullOrEmpty(name) && string.Equals(v.Name, name, StringComparison.OrdinalIgnoreCase))
                        ?? definition.Values.FirstOrDefault(v =>
                            !string.IsNullOrEmpty(valueId) && string.Equals(v.Name, valueId, StringComparison.OrdinalIgnoreCase));
                    return match is null
                        ? (null, $"El valor «{name ?? valueId}» no es uno de los permitidos para {definition.Name}.")
                        : (new Normalized(match.Id, match.Name, null, null), null);
                }

            case MeliAttributeKind.Number:
                {
                    var match = NumberOnly.Match(name ?? valueId ?? "");
                    return !match.Success || !TryNumber(match.Groups[1].Value, out var number)
                        ? (null, $"El valor «{name ?? valueId}» de {definition.Name} tiene que ser un número.")
                        : (new Normalized(null, number, null, null), null);
                }

            case MeliAttributeKind.NumberUnit:
                return NormalizeNumberUnit(definition, name ?? valueId, attribute.Unit?.Trim());

            default:
                {
                    var text = name ?? valueId ?? "";
                    return definition.MaxLength is { } max && text.Length > max
                        ? (null, $"El valor de {definition.Name} tiene {text.Length} caracteres: el máximo es {max}.")
                        : (new Normalized(null, text, null, null), null);
                }
        }
    }

    private static (Normalized? Value, string? Problem) NormalizeNumberUnit(MeliCategoryAttribute definition, string? raw, string? explicitUnit)
    {
        var match = NumberWithUnit.Match(raw ?? "");
        if (!match.Success || !TryNumber(match.Groups[1].Value, out var number))
            return (null, $"El valor «{raw}» de {definition.Name} tiene que ser un número con su unidad.");

        var unit = !string.IsNullOrWhiteSpace(explicitUnit) ? explicitUnit : match.Groups[2].Success ? match.Groups[2].Value.Trim() : null;
        string? note = null;
        if (string.IsNullOrEmpty(unit))
        {
            if (definition.DefaultUnit is not { } fallback)
                return (null, $"Falta la unidad de {definition.Name}.");
            unit = fallback;
            note = $"{definition.Name} vino sin unidad: se usó {fallback}.";
        }

        if (definition.AllowedUnits.Count > 0)
        {
            var allowed = definition.AllowedUnits.FirstOrDefault(u => string.Equals(u, unit, StringComparison.OrdinalIgnoreCase));
            if (allowed is null)
                return (null, $"La unidad «{unit}» de {definition.Name} no es válida: usá {string.Join(", ", definition.AllowedUnits)}.");
            unit = allowed;
        }
        return (new Normalized(null, number, unit, note), null);
    }

    private static bool TryNumber(string raw, out string normalized)
    {
        normalized = "";
        if (!decimal.TryParse(raw.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var number)) return false;
        normalized = number.ToString(CultureInfo.InvariantCulture);
        return true;
    }

    /// <summary>
    /// Un identificador (GTIN/EAN, modelo, número de parte) solo vale si aparece textual en los datos del producto; un GTIN,
    /// además, con dígito verificador válido. <paramref name="requireTextual"/> es false para lo que tipea una persona.
    /// </summary>
    private static string? CheckIdentifier(MeliCategoryAttribute definition, Normalized value, string? sourceText, bool requireTextual)
    {
        var isGtin = GtinIds.Contains(definition.Id);
        if (isGtin)
        {
            var digits = Gtin.Normalize(value.ValueName);
            if (!requireTextual)
                return Gtin.IsValid(digits) ? null : $"El {definition.Name} «{value.ValueName}» no es válido: revisá los dígitos.";

            // Cada número del texto por separado: pegar los dígitos de campos vecinos podría armar un GTIN que no está escrito.
            if (!NumbersIn(sourceText ?? "").Any(number => number.Contains(digits, StringComparison.Ordinal)))
                return $"El {definition.Name} no aparece en los datos del producto: queda para completar.";
            return Gtin.IsValid(digits) ? null : $"El {definition.Name} que aparece en los datos no tiene un dígito verificador válido: queda para completar.";
        }

        if (requireTextual && !AppearsAsWord(sourceText ?? "", value.ValueName.Trim()))
            return $"El {definition.Name} no aparece en los datos del producto: queda para completar.";
        return null;
    }

    private const int MinIdentifierLength = 4;

    private static readonly Regex DigitRuns = new(@"\d+(?:[ .\-]\d+)*", RegexOptions.Compiled);

    /// <summary>Cada número escrito en el texto, sin espacios, puntos ni guiones (los que lo parten en grupos), sin cruzar letras ni saltos de línea.</summary>
    private static IEnumerable<string> NumbersIn(string text) =>
        DigitRuns.Matches(text).Select(m => new string([.. m.Value.Where(char.IsAsciiDigit)]));

    /// <summary>La palabra completa (no un pedazo de otra) y de al menos <see cref="MinIdentifierLength"/> caracteres.</summary>
    private static bool AppearsAsWord(string text, string value) =>
        value.Length >= MinIdentifierLength
        && Regex.IsMatch(text, $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(value)}(?![\p{{L}}\p{{N}}])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
}
