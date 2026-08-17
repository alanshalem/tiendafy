using System.Text;
using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Media.Infrastructure;

/// <summary>
/// Saneo de SVG subido por el merchant: quita todo lo ejecutable (scripts,
/// on*, foreignObject, DOCTYPE/ENTITY, javascript:). Antes vivía en MediaStorage.
/// </summary>
internal static class SvgSanitizer
{
    // Saneo de SVG: timeout corto en cada regex para descartar cualquier ReDoS sobre
    // input adversario (el contenido ya está acotado a 1 MB, pero por las dudas).
    internal static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

    internal static string Scrub(string input, string pattern) =>
        Regex.Replace(input, pattern, string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.Singleline, RegexTimeout);

    /// <summary>
    /// Saca de un SVG todo lo que pueda ejecutar código si el archivo se abriera como
    /// documento: &lt;script&gt;, manejadores on*, &lt;foreignObject&gt; (puede contener HTML/JS),
    /// DOCTYPE/ENTITY (XXE / billion-laughs) y URIs javascript:. Devuelve los bytes limpios.
    /// </summary>
    internal static Result<byte[]> Sanitize(byte[] raw)
    {
        string svg;
        try
        {
            // SVG es UTF-8/ASCII; rechazá BOM/encoding raro decodificando estricto-ish.
            svg = Encoding.UTF8.GetString(raw);
        }
        catch
        {
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo SVG no es válido."));
        }

        // Tiene que parecer un SVG real (no HTML/script disfrazado).
        if (svg.IndexOf("<svg", StringComparison.OrdinalIgnoreCase) < 0)
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo no es un SVG válido."));

        try
        {
            svg = Scrub(svg, @"<!DOCTYPE[^>]*>");
            svg = Scrub(svg, @"<!ENTITY[^>]*>");
            svg = Scrub(svg, @"<\?xml-stylesheet[^>]*\?>");
            svg = Scrub(svg, @"<script\b[^>]*>.*?</script\s*>");
            svg = Scrub(svg, @"<script\b[^>]*/?>");
            svg = Scrub(svg, @"<foreignObject\b[^>]*>.*?</foreignObject\s*>");
            svg = Scrub(svg, @"<foreignObject\b[^>]*/?>");
            // Manejadores de eventos: onload=, onclick=, etc. El separador puede ser
            // whitespace O '/' (los navegadores aceptan <svg/onload=…> como atributo).
            svg = Scrub(svg, @"[\s/]on\w+\s*=\s*(""[^""]*""|'[^']*'|[^\s>]+)");
            // URIs javascript: en href / xlink:href / src.
            svg = Scrub(svg, @"(?:href|xlink:href|src)\s*=\s*(?:""\s*javascript:[^""]*""|'\s*javascript:[^']*'|javascript:[^\s>]*)");
        }
        catch (RegexMatchTimeoutException)
        {
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "No pudimos procesar el SVG. Probá con otro archivo."));
        }

        return Encoding.UTF8.GetBytes(svg);
    }

}
