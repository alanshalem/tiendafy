using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using SharedKernel.Common;

namespace Media.Infrastructure;

/// <summary>
/// Saneo de SVG subido por el comercio (logo, favicon, íconos).
///
/// <para>
/// No "limpia" lo peligroso: lo reescribe desde cero con una lista de lo que
/// sí se permite. La versión anterior sacaba &lt;script&gt;, on* y javascript:
/// con expresiones regulares, y se evadía escribiéndolos de otra forma
/// (&lt;s:script xmlns:s="…svg"&gt;, <c>href="&amp;#106;avascript:…"</c>). Acá el
/// archivo se parsea como XML, así que el prefijo, las entidades y las
/// mayúsculas ya llegan resueltos, y de lo que llega solo se copia:
/// </para>
/// <list type="bullet">
/// <item>elementos de dibujo de SVG (ver <see cref="Elements"/>); cualquier
/// otro, o uno de otro namespace, se descarta con todo su contenido;</item>
/// <item>atributos de geometría y presentación (ver <see cref="AttributeNames"/>),
/// sin namespace salvo <c>xlink:href</c>; ningún <c>on*</c>;</item>
/// <item><c>url(…)</c> solo hacia un <c>#id</c> del mismo archivo;</item>
/// <item><c>href</c> solo <c>#fragmento</c>, o en &lt;image&gt; un bitmap
/// embebido en <c>data:</c> (PNG, JPEG, GIF o WebP).</item>
/// </list>
/// <para>
/// La DTD no se procesa ni se baja (sin XXE ni "billion laughs"): una entidad
/// propia queda sin declarar y el archivo no parsea. Lo que no parsea como
/// SVG se rechaza.
/// </para>
/// </summary>
internal static class SvgSanitizer
{
    private const string SvgNs = "http://www.w3.org/2000/svg";
    private const string XLinkNs = "http://www.w3.org/1999/xlink";

    /// <summary>Más que esto no lo arma ningún editor; un archivo así busca romper algo.</summary>
    internal const int MaxDepth = 64;

    /// <summary>Lo que se dibuja. Sin script, foreignObject, a, animate, set, style ni nada de otro namespace.</summary>
    private static readonly HashSet<string> Elements = new(StringComparer.Ordinal)
    {
        "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
        "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath",
        "mask", "symbol", "use", "title", "desc", "pattern", "image",
    };

    /// <summary>Elementos cuyo texto se conserva. En el resto, el texto no se dibuja y se descarta.</summary>
    private static readonly HashSet<string> TextElements = new(StringComparer.Ordinal)
    {
        "text", "tspan", "title", "desc",
    };

    /// <summary>Geometría y presentación, sin namespace. Nada que empiece con "on".</summary>
    private static readonly HashSet<string> AttributeNames = new(StringComparer.Ordinal)
    {
        // Identidad y estructura
        "id", "class", "version", "baseProfile", "viewBox", "preserveAspectRatio", "transform",
        "transform-origin", "x", "y", "width", "height",
        // Formas
        "d", "points", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "pathLength",
        // Texto
        "dx", "dy", "rotate", "textLength", "lengthAdjust", "font-family", "font-size",
        "font-size-adjust", "font-weight", "font-style", "font-variant", "font-stretch",
        "text-anchor", "dominant-baseline", "alignment-baseline", "baseline-shift",
        "letter-spacing", "word-spacing", "text-decoration", "writing-mode", "direction",
        "unicode-bidi",
        // Degradés, patrones, recortes y máscaras
        "offset", "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "fr",
        "patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits",
        "maskUnits", "maskContentUnits", "refX", "refY",
        // Presentación
        "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
        "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
        "stroke-dashoffset", "opacity", "color", "display", "visibility", "clip-path",
        "clip-rule", "mask", "stop-color", "stop-opacity", "overflow", "shape-rendering",
        "text-rendering", "image-rendering", "color-interpolation",
        "color-interpolation-filters", "vector-effect", "paint-order", "mix-blend-mode",
        "isolation", "style",
        // Accesibilidad (texto plano, no carga ni ejecuta nada)
        "role", "aria-label", "aria-hidden", "focusable",
        // Referencias (validadas aparte)
        "href",
    };

    /// <summary>Un <c>#id</c> del mismo archivo.</summary>
    private static readonly Regex Fragment = new(
        @"^#[A-Za-z_][A-Za-z0-9_\-.:]*$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

    /// <summary>Bitmap embebido: lo único que puede cargar un &lt;image&gt;.</summary>
    private static readonly Regex DataBitmap = new(
        @"^data:image/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]+$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    /// <summary>Todo url(…) del valor; cada uno tiene que apuntar a un #id.</summary>
    private static readonly Regex AnyUrl = new(
        @"url\s*\(", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    /// <summary>image-set(, src(, image(, cross-fade(, element( (con o sin prefijo de navegador).</summary>
    private static readonly Regex ResourceFunction = new(
        @"(?<![A-Za-z0-9_])(?:-[a-z]+-)?(?:image-set|src|image|cross-fade|element)\s*\(",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    private static readonly Regex LocalUrl = new(
        @"url\s*\(\s*(['""]?)#[A-Za-z_][A-Za-z0-9_\-.:]*\1\s*\)",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    internal static Result<byte[]> Sanitize(byte[] raw)
    {
        try
        {
            var cleaned = Rewrite(raw);
            return cleaned is null
                ? Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo no es un SVG válido."))
                : cleaned;
        }
        catch (Exception ex) when (ex is XmlException or InvalidOperationException
                                       or RegexMatchTimeoutException or ArgumentException)
        {
            return Result.Failure<byte[]>(Error.Validation("Media.BadSvg", "El archivo SVG no es válido."));
        }
    }

    /// <summary>Copia lo permitido a un documento nuevo; null si la raíz no es un &lt;svg&gt;.</summary>
    private static byte[]? Rewrite(byte[] raw)
    {
        var readerSettings = new XmlReaderSettings
        {
            // Ignore y no Prohibit: Illustrator exporta con el DOCTYPE público
            // de SVG 1.1 y prohibirlo rechazaría esos logos. Ignorada, la DTD
            // no se lee ni se baja (XmlResolver null) y sus entidades no se
            // declaran: usarlas hace fallar el parseo.
            DtdProcessing = DtdProcessing.Ignore,
            XmlResolver = null,
            MaxCharactersFromEntities = 1024,
            MaxCharactersInDocument = 4 * 1024 * 1024,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true,
        };

        using var input = new MemoryStream(raw, writable: false);
        using var reader = XmlReader.Create(input, readerSettings);
        using var output = new MemoryStream();
        using (var writer = XmlWriter.Create(output, new XmlWriterSettings
        {
            Encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
            Indent = false,
        }))
        {
            if (reader.MoveToContent() != XmlNodeType.Element
                || reader.LocalName != "svg"
                || reader.NamespaceURI is not (SvgNs or ""))
                return null;

            // Un SVG sin namespace se toma entero sin namespace; uno con el de
            // SVG, solo lo que está en ese namespace.
            var rootNs = reader.NamespaceURI;
            var open = new Stack<string>();
            // El id más cercano de cada elemento abierto (el propio, o el de un
            // ancestro): de ahí salen las aristas <use> → destino del grafo.
            var ids = new Stack<string>();
            var uses = new UseGraph();
            var wroteRoot = false;

            while (!reader.EOF)
            {
                switch (reader.NodeType)
                {
                    case XmlNodeType.Element:
                        if (reader.Depth >= MaxDepth)
                            throw new XmlException("SVG demasiado anidado.");

                        if (reader.NamespaceURI != rootNs || !Elements.Contains(reader.LocalName))
                        {
                            reader.Skip(); // el elemento con todo su contenido
                            continue;
                        }

                        var name = reader.LocalName;
                        var attributes = ReadAttributes(reader, name);
                        if (name == "image" && !attributes.Any(a => a.LocalName == "href"))
                        {
                            reader.Skip(); // una imagen que no es un bitmap embebido no carga nada
                            continue;
                        }

                        writer.WriteStartElement(name, SvgNs);
                        if (!wroteRoot)
                        {
                            writer.WriteAttributeString("xmlns", "xlink", null, XLinkNs);
                            wroteRoot = true;
                        }
                        foreach (var a in attributes)
                            writer.WriteAttributeString(a.LocalName, a.Namespace, a.Value);

                        var ownId = attributes.FirstOrDefault(a => a.LocalName == "id" && a.Namespace is null)?.Value;
                        var nearestId = ownId ?? (ids.Count > 0 ? ids.Peek() : "");
                        if (name == "use")
                        {
                            var target = attributes.FirstOrDefault(a => a.LocalName == "href")?.Value;
                            uses.Add(nearestId, target is { Length: > 1 } && target[0] == '#' ? target[1..] : null);
                        }

                        if (reader.IsEmptyElement)
                            writer.WriteEndElement();
                        else
                        {
                            open.Push(name);
                            ids.Push(nearestId);
                        }
                        break;

                    case XmlNodeType.EndElement:
                        writer.WriteEndElement();
                        open.Pop();
                        ids.Pop();
                        break;

                    case XmlNodeType.Text:
                    case XmlNodeType.CDATA:
                    case XmlNodeType.Whitespace:
                    case XmlNodeType.SignificantWhitespace:
                        // Como texto escapado, nunca como CDATA: en un SVG es inerte.
                        if (open.Count > 0 && TextElements.Contains(open.Peek()))
                            writer.WriteString(reader.Value);
                        break;

                        // Declaración XML, DOCTYPE (ignorado) y el resto: no se copian.
                }

                reader.Read();
            }

            // Antes de dar el archivo por bueno: las referencias <use> no pueden
            // multiplicarse (ver UseGraph).
            uses.Validate();
        }

        return output.ToArray();
    }

    /// <summary>Cuántos &lt;use&gt; admite un archivo: un logo no usa decenas.</summary>
    internal const int MaxUseElements = 50;

    /// <summary>Cuántas veces se dibuja algo, contando lo que cada &lt;use&gt; vuelve a dibujar.</summary>
    internal const long MaxUseExpansions = 500;

    /// <summary>
    /// Un &lt;use&gt; dibuja de nuevo el elemento al que apunta, y si ese contiene
    /// otros &lt;use&gt;, también esos: 10 niveles de 10 usos son 10^10 dibujos y le
    /// cuelgan el navegador a quien vea el logo. Se arma el grafo "elemento con
    /// id → ids que usa" y se rechaza si hay ciclos o si la cuenta total de
    /// dibujos pasa <see cref="MaxUseExpansions"/>.
    /// </summary>
    private sealed class UseGraph
    {
        private readonly Dictionary<string, List<string?>> _edges = new(StringComparer.Ordinal);
        private int _count;

        public void Add(string from, string? target)
        {
            if (++_count > MaxUseElements)
                throw new XmlException("Demasiados <use>.");
            if (!_edges.TryGetValue(from, out var list)) _edges[from] = list = [];
            list.Add(target);
        }

        public void Validate()
        {
            var memo = new Dictionary<string, long>(StringComparer.Ordinal);
            var visiting = new HashSet<string>(StringComparer.Ordinal);
            // Todos los nodos, no solo desde la raíz: un patrón o una máscara en
            // <defs> se dibuja cuando un fill o un mask lo referencia, sin <use>.
            foreach (var node in _edges.Keys)
                if (Expansions(node, memo, visiting) > MaxUseExpansions)
                    throw new XmlException("Los <use> se multiplican demasiado.");
        }

        private long Expansions(string node, Dictionary<string, long> memo, HashSet<string> visiting)
        {
            if (memo.TryGetValue(node, out var known)) return known;
            if (!visiting.Add(node)) throw new XmlException("Un <use> se referencia a sí mismo.");

            long total = 0;
            if (_edges.TryGetValue(node, out var targets))
                foreach (var target in targets)
                {
                    total++;
                    if (target is not null) total += Expansions(target, memo, visiting);
                    if (total > MaxUseExpansions * 2) break; // ya se pasó: no seguir sumando
                }

            visiting.Remove(node);
            memo[node] = total;
            return total;
        }
    }

    private sealed record SafeAttribute(string LocalName, string? Namespace, string Value);

    private static List<SafeAttribute> ReadAttributes(XmlReader reader, string element)
    {
        var kept = new List<SafeAttribute>();
        if (!reader.MoveToFirstAttribute()) return kept;

        do
        {
            var ns = reader.NamespaceURI;
            var local = reader.LocalName;
            var value = reader.Value;

            if (ns == XLinkNs && local == "href")
            {
                if (IsSafeHref(element, value)) kept.Add(new SafeAttribute("href", XLinkNs, value));
                continue;
            }
            // Declaraciones de namespace, xml:*, atributos de editores
            // (inkscape:*, sodipodi:*) y cualquier otro con namespace: afuera.
            if (ns.Length > 0 || !AttributeNames.Contains(local)) continue;

            if (local == "href")
            {
                if (IsSafeHref(element, value)) kept.Add(new SafeAttribute("href", null, value));
                continue;
            }
            if (IsSafeValue(local, value)) kept.Add(new SafeAttribute(local, null, value));
        }
        while (reader.MoveToNextAttribute());

        reader.MoveToElement();
        return kept;
    }

    /// <summary>Un #id propio; en &lt;image&gt;, además, un bitmap embebido.</summary>
    private static bool IsSafeHref(string element, string value) =>
        Fragment.IsMatch(value) || (element == "image" && DataBitmap.IsMatch(value));

    private static bool IsSafeValue(string attribute, string value)
    {
        // Las secuencias de escape de CSS (u\72l, \6a avascript) sirven para
        // esconder lo que se busca abajo; en geometría y colores no hacen falta.
        if (value.Contains('\\') || value.Contains('<')) return false;

        if (attribute == "style"
            && (value.Contains('@')
                || value.Contains("expression", StringComparison.OrdinalIgnoreCase)
                || value.Contains("javascript", StringComparison.OrdinalIgnoreCase)
                || value.Contains("binding", StringComparison.OrdinalIgnoreCase)
                || value.Contains("behavior", StringComparison.OrdinalIgnoreCase)))
            return false;

        // Funciones de CSS que piden un recurso sin escribir url(…) (image-set,
        // src, image, cross-fade, element): un pedido de rastreo a otro lado.
        if (ResourceFunction.IsMatch(value)) return false;

        // Cada url(…) tiene que ser un url(#id): sin pedidos a otro lado.
        return AnyUrl.Count(value) == LocalUrl.Count(value);
    }
}
