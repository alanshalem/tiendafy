using System.Globalization;
using System.Text;
using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Sinónimos del buscador de la tienda: grupos de palabras que el comprador
/// usa para lo mismo. "mancuerna" encontraba 3 productos mientras el catálogo
/// tenía decenas cargados como "DUMBBELLS…": el comprador escribe en
/// castellano y el importador carga como viene de fábrica.
///
/// <para>
/// Un grupo es simétrico: cualquiera de sus términos encuentra lo que dicen
/// los demás. Un término puede tener varias palabras ("pesa rusa"): en la
/// búsqueda cuenta como una sola.
/// </para>
/// </summary>
public static class SearchSynonyms
{
    public const int MaxGroups = 300;
    public const int MaxTermsPerGroup = 20;
    public const int MaxTermLength = 60;

    /// <summary>
    /// Los de fábrica, mientras la tienda no guarde su propia lista. Términos
    /// comunes del rioplatense contra cómo suelen venir cargados (inglés de
    /// importación, o el nombre de otro país). La comparación ignora
    /// mayúsculas y tildes. Nada de términos cortos que aparecen adentro de
    /// otras palabras ("mat" está en "material", "plate" en "plateado"): la
    /// búsqueda es por fragmento y traerían cualquier cosa.
    /// </summary>
    public static readonly IReadOnlyList<IReadOnlyList<string>> Defaults =
    [
        ["mancuerna", "dumbbell"],
        ["pesa rusa", "kettlebell"],
        ["barra", "barbell"],
        ["banco", "bench"],
        ["colchoneta", "esterilla", "yoga mat"],
        ["bicicleta", "bici", "bike"],
        ["cinta de correr", "caminadora", "treadmill"],
        ["remo", "rower"],
        ["banda elástica", "banda de resistencia", "resistance band"],
        ["soga", "cuerda", "jump rope"],
        ["guantes", "gloves"],
        ["zapatillas", "sneakers"],
        ["remera", "camiseta", "playera", "t-shirt"],
        ["buzo", "sudadera", "hoodie"],
        ["campera", "chaqueta", "jacket"],
        ["auriculares", "audífonos", "headphones"],
        ["celular", "teléfono", "smartphone"],
        ["cargador", "charger"],
        ["notebook", "laptop", "portátil"],
        ["heladera", "nevera", "refrigerador"],
        ["anteojos", "lentes", "gafas"],
        ["mochila", "backpack"],
        ["pileta", "piscina"],
        ["botella", "caramañola"],
        ["proteína", "protein", "whey"],
        ["creatina", "creatine"],
    ];

    /// <summary>
    /// En minúscula, sin tildes y con un solo espacio entre palabras: la forma
    /// en que se comparan los términos con lo que se escribió. Igual que el
    /// <c>unaccent</c> de la base, la ñ pasa a n: quien escribe sin tildes
    /// tampoco suele tener la ñ a mano.
    /// </summary>
    public static string Normalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var decomposed = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(char.IsWhiteSpace(c) ? ' ' : c);
        }
        return string.Join(' ', sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>
    /// Limpia una lista que llega del panel: términos sin espacios de más, sin
    /// repetidos, sin comas (separan términos al guardarse), grupos de al menos
    /// dos términos. Un grupo de uno no es un sinónimo de nada.
    /// </summary>
    public static Result<IReadOnlyList<IReadOnlyList<string>>> Clean(IEnumerable<IEnumerable<string?>?>? groups)
    {
        var cleaned = new List<IReadOnlyList<string>>();
        foreach (var group in groups ?? [])
        {
            // Se guarda como lo escribió el comercio (en minúscula y con un
            // espacio entre palabras): "proteína" se lee mejor que "proteína".
            // Los repetidos sí se comparan sin tildes.
            var terms = (group ?? [])
                .SelectMany(t => (t ?? string.Empty).Split(','))
                .Select(t => string.Join(' ', t.ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)))
                .Where(t => t.Length > 0)
                .DistinctBy(Normalize)
                .ToList();
            if (terms.Count < 2) continue;
            if (terms.Count > MaxTermsPerGroup)
                return Result.Failure<IReadOnlyList<IReadOnlyList<string>>>(Error.Validation(
                    "Search.TooManyTerms", $"Un grupo puede tener hasta {MaxTermsPerGroup} palabras."));
            if (terms.Find(t => t.Length > MaxTermLength) is { } tooLong)
                return Result.Failure<IReadOnlyList<IReadOnlyList<string>>>(Error.Validation(
                    "Search.TermTooLong", $"«{tooLong}» es muy largo: hasta {MaxTermLength} letras por término."));
            cleaned.Add(terms);
        }

        if (cleaned.Count > MaxGroups)
            return Result.Failure<IReadOnlyList<IReadOnlyList<string>>>(Error.Validation(
                "Search.TooManyGroups", $"Se pueden cargar hasta {MaxGroups} grupos de sinónimos."));
        return Result.Success<IReadOnlyList<IReadOnlyList<string>>>(cleaned);
    }

    /// <summary>
    /// Lo que se escribió, partido en lo que tiene que aparecer: cada lugar es
    /// una lista de alternativas, y alcanza con que aparezca una. Sin sinónimos,
    /// cada palabra es un lugar con una sola alternativa (ella misma).
    ///
    /// <para>
    /// Un término de varias palabras se reconoce entero ("pesa rusa 12 kg" →
    /// [pesa rusa | kettlebell], [12], [kg]); si no, "pesa" y "rusa" se
    /// buscarían por separado y "kettlebell" no aparecería nunca. Entre dos
    /// términos que empiezan igual gana el más largo.
    /// </para>
    ///
    /// <para>
    /// El plural simple ("mancuernas", "discos") también encuentra el grupo:
    /// es lo primero que escribe cualquiera, y la búsqueda por fragmento ya
    /// encuentra "mancuernas" con "mancuerna", pero no "dumbbells".
    /// </para>
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<string>> Expand(
        string? text, IReadOnlyList<IReadOnlyList<string>>? groups)
    {
        var words = (text ?? string.Empty)
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (words.Length == 0) return [];
        if (groups is not { Count: > 0 }) return [.. words.Select(w => (IReadOnlyList<string>)[w])];

        // Cada término (ya partido en palabras) con su grupo, del más largo al
        // más corto: así "cinta de correr" le gana a "cinta".
        var terms = groups
            .SelectMany(g => g.Select(t => (Words: Normalize(t).Split(' ', StringSplitOptions.RemoveEmptyEntries), Group: g)))
            .Where(t => t.Words.Length > 0)
            .OrderByDescending(t => t.Words.Length)
            .ToList();
        var normalized = words.Select(Normalize).ToArray();

        var slots = new List<IReadOnlyList<string>>();
        for (var i = 0; i < words.Length;)
        {
            var match = terms.FirstOrDefault(t => Matches(normalized, i, t.Words));
            if (match.Words is null)
            {
                slots.Add([words[i]]);
                i++;
                continue;
            }

            // Lo escrito va primero (por si es más específico que el término),
            // después el grupo entero.
            var typed = string.Join(' ', words.Skip(i).Take(match.Words.Length));
            slots.Add([.. new[] { typed }.Concat(match.Group).DistinctBy(Normalize)]);
            i += match.Words.Length;
        }
        return slots;
    }

    private static bool Matches(string[] words, int start, string[] term)
    {
        if (start + term.Length > words.Length) return false;
        for (var k = 0; k < term.Length; k++)
        {
            var word = words[start + k];
            var expected = term[k];
            // Cada palabra admite su plural: "pesas rusas" es como lo escribe
            // la mayoría.
            if (word == expected || word == expected + "s" || word == expected + "es") continue;
            return false;
        }
        return true;
    }
}
