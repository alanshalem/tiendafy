using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Slug de URL: "Remera Oversize Ñandú" → "remera-oversize-nandu".
/// Estable una vez asignado (cambiarlo rompe SEO y links compartidos);
/// solo cambia por acción explícita del merchant.
/// </summary>
public sealed partial record Slug
{
    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$")]
    private static partial Regex ValidPattern();

    public string Value { get; }

    private Slug(string value) => Value = value;

    public static Result<Slug> Create(string? raw)
    {
        var slugified = Slugify(raw ?? string.Empty);

        if (!ValidPattern().IsMatch(slugified))
            return Result.Failure<Slug>(Error.Validation(
                "Slug.Invalid",
                "El identificador de URL tiene que tener entre 1 y 120 caracteres: minúsculas, números y guiones."));

        return new Slug(slugified);
    }

    /// <summary>Normaliza texto libre a slug: minúsculas, sin acentos, guiones.</summary>
    private static string Slugify(string input)
    {
        // Descomponer acentos: á → a + combining mark, y descartar las marcas.
        var normalized = input.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var ch in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark) continue;

            builder.Append(ch switch
            {
                >= 'a' and <= 'z' or >= '0' and <= '9' => ch,
                'ñ' => 'n', // FormD no descompone ñ en todos los runtimes; explícito
                _ => '-',
            });
        }

        // Colapsar guiones repetidos y recortar extremos.
        var collapsed = Regex.Replace(builder.ToString(), "-{2,}", "-").Trim('-');
        return collapsed.Length > 120 ? collapsed[..120].Trim('-') : collapsed;
    }

    public override string ToString() => Value;
}
