using System.Text;
using System.Xml.Linq;
using Media.Infrastructure;

namespace UnitTests.Media;

/// <summary>
/// El saneo de los SVG que sube un comercio (logo, favicon, íconos). El
/// archivo queda en un bucket público: si alguien abre su URL directa, el
/// navegador lo renderiza como documento y cualquier script corre en ese
/// origen. Por eso no se "limpia" lo malo (siempre aparece otra forma de
/// escribirlo) sino que se reescribe solo lo que está en la lista de dibujo.
/// </summary>
public sealed class SvgSanitizerTests
{
    private const string Svg = "http://www.w3.org/2000/svg";

    private static string Clean(string svg)
    {
        var result = SvgSanitizer.Sanitize(Encoding.UTF8.GetBytes(svg));
        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : null);
        return Encoding.UTF8.GetString(result.Value);
    }

    private static void AssertRejected(string svg) =>
        Assert.True(SvgSanitizer.Sanitize(Encoding.UTF8.GetBytes(svg)).IsFailure);

    /// <summary>Lo que quedó, parseado: así se afirma sobre lo que vería el navegador y no sobre el texto.</summary>
    private static XElement Parse(string cleaned) => XElement.Parse(cleaned);

    private static IEnumerable<string> Names(XElement root) =>
        root.DescendantsAndSelf().Select(e => e.Name.LocalName);

    private static IEnumerable<XAttribute> Attributes(XElement root) =>
        root.DescendantsAndSelf().SelectMany(e => e.Attributes()).Where(a => !a.IsNamespaceDeclaration);

    [Fact]
    public void Un_logo_normal_queda_igual_en_lo_que_dibuja()
    {
        var cleaned = Parse(Clean($"""
            <?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="{Svg}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 40" width="100" height="40" role="img" aria-label="Mi marca">
              <title>Mi marca</title>
              <defs>
                <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient>
                <clipPath id="c"><rect width="100" height="40" rx="4"/></clipPath>
              </defs>
              <g clip-path="url(#c)" transform="translate(1 1)">
                <path d="M0 0L10 10Z" fill="url(#g)" stroke="#000" stroke-width="2"/>
                <circle cx="5" cy="5" r="3" style="fill: url('#g'); opacity: .5"/>
                <text x="20" y="30" font-family="Inter" font-size="12">Tienda &amp; Co <tspan font-weight="bold">2026</tspan></text>
                <use xlink:href="#c"/>
                <use href="#g"/>
              </g>
            </svg>
            """));

        Assert.Equal(XName.Get("svg", Svg), cleaned.Name);
        Assert.Equal("0 0 100 40", cleaned.Attribute("viewBox")?.Value);
        Assert.Equal("Mi marca", cleaned.Attribute("aria-label")?.Value);
        Assert.Equal(["svg", "title", "defs", "linearGradient", "stop", "stop", "clipPath", "rect", "g", "path", "circle", "text", "tspan", "use", "use"], Names(cleaned));
        Assert.All(cleaned.DescendantsAndSelf(), e => Assert.Equal(Svg, e.Name.NamespaceName));
        Assert.Equal("url(#g)", cleaned.Descendants(XName.Get("path", Svg)).Single().Attribute("fill")?.Value);
        Assert.Equal("fill: url('#g'); opacity: .5", cleaned.Descendants(XName.Get("circle", Svg)).Single().Attribute("style")?.Value);
        Assert.Equal("Tienda & Co 2026", cleaned.Descendants(XName.Get("text", Svg)).Single().Value);
        Assert.Equal("Mi marca", cleaned.Element(XName.Get("title", Svg))?.Value);
        var uses = cleaned.Descendants(XName.Get("use", Svg)).ToList();
        Assert.Equal("#c", uses[0].Attribute(XName.Get("href", "http://www.w3.org/1999/xlink"))?.Value);
        Assert.Equal("#g", uses[1].Attribute("href")?.Value);
    }

    /// <summary>Los logos de verdad del repo (marcas de la importadora): pasan enteros.</summary>
    public static TheoryData<string> RepoSvgs()
    {
        var root = UnitTests.Architecture.RepoRoot.Path.FullName;
        var data = new TheoryData<string>();
        foreach (var dir in new[] { Path.Combine(root, "docs", "marca"), Path.Combine(root, "storefront", "public") })
            foreach (var file in Directory.EnumerateFiles(dir, "*.svg", SearchOption.AllDirectories))
                data.Add(Path.GetRelativePath(root, file));
        return data;
    }

    [Theory]
    [MemberData(nameof(RepoSvgs))]
    public void Los_logos_reales_conservan_todo_lo_que_dibujan(string relativePath)
    {
        var original = XElement.Parse(File.ReadAllText(Path.Combine(UnitTests.Architecture.RepoRoot.Path.FullName, relativePath)));
        var cleaned = Parse(Clean(original.ToString()));

        Assert.Equal(Names(original), Names(cleaned));
        Assert.Equal(
            Attributes(original).Select(a => $"{a.Parent!.Name.LocalName}@{a.Name}={a.Value}"),
            Attributes(cleaned).Select(a => $"{a.Parent!.Name.LocalName}@{a.Name}={a.Value}"));
    }

    [Theory]
    // El script con prefijo de namespace: para el XML es un <script> de SVG.
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script><rect width="1" height="1"/></svg>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[alert(1)]]></script><rect width="1" height="1"/></svg>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT><rect width="1" height="1"/></svg>""")]
    // HTML adentro de foreignObject.
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></foreignObject><rect width="1" height="1"/></svg>""")]
    // Animaciones que cambian el href de un link a javascript:.
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:alert(1)"/><rect width="1" height="1"/></a><rect width="1" height="1"/></svg>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onmouseover" to="alert(1)"/><rect width="1" height="1"/></svg>""")]
    // Un elemento de otro namespace (XHTML) con su contenido.
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><h:iframe xmlns:h="http://www.w3.org/1999/xhtml" src="javascript:alert(1)"/><rect width="1" height="1"/></svg>""")]
    public void Lo_ejecutable_se_va_con_su_contenido(string svg)
    {
        var cleaned = Clean(svg);
        var root = Parse(cleaned);

        Assert.Equal(["svg", "rect"], Names(root));
        Assert.DoesNotContain("alert", cleaned, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript", cleaned, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg" ONLOAD="alert(1)"><rect width="1" height="1" onclick="alert(1)"/></svg>""")]
    // El nombre del atributo con un prefijo que apunta al namespace vacío no existe en XML; con otro namespace, se descarta.
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg" xmlns:e="urn:x" e:onload="alert(1)"><rect width="1" height="1"/></svg>""")]
    public void Los_manejadores_de_eventos_no_pasan(string svg)
    {
        var root = Parse(Clean(svg));
        Assert.DoesNotContain(Attributes(root), a => a.Name.LocalName.StartsWith("on", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void La_forma_html_svg_barra_onload_no_es_xml_y_se_rechaza()
    {
        // <svg/onload=…> es HTML, no XML: como SVG no parsea, y lo que no
        // parsea no se sube.
        AssertRejected("<svg/onload=alert(1)>");
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("&#106;avascript:alert(1)")]
    [InlineData("&#x6A;avascript:alert(1)")]
    [InlineData(" JaVaScRiPt:alert(1)")]
    [InlineData("https://evil.example/x.svg#a")]
    [InlineData("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")]
    [InlineData("other.svg#a")]
    public void Un_href_que_no_es_un_fragmento_propio_se_descarta(string href)
    {
        var cleaned = Clean($"""
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
              <use href="{href}"/><use xlink:href="{href}"/><linearGradient id="g" href="{href}"/>
            </svg>
            """);
        var root = Parse(cleaned);

        Assert.DoesNotContain(Attributes(root), a => a.Name.LocalName == "href");
        Assert.DoesNotContain("javascript", cleaned, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("evil", cleaned, StringComparison.Ordinal);
    }

    [Fact]
    public void Una_imagen_embebida_pasa_solo_si_es_un_bitmap_en_data()
    {
        const string png = "data:image/png;base64,iVBORw0KGgo=";
        var root = Parse(Clean($"""
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
              <image href="{png}" width="10" height="10"/>
              <image xlink:href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="10" height="10"/>
              <image href="https://evil.example/pixel.png" width="10" height="10"/>
              <image width="10" height="10"/>
              <use href="{png}"/>
            </svg>
            """));

        var image = Assert.Single(root.Descendants(XName.Get("image", Svg)));
        Assert.Equal(png, image.Attribute("href")?.Value);
        Assert.Null(root.Descendants(XName.Get("use", Svg)).Single().Attribute("href"));
    }

    [Theory]
    [InlineData("fill", "url(https://evil.example/x)")]
    [InlineData("fill", "url( javascript:alert(1) )")]
    [InlineData("style", "fill: url(https://evil.example/track.png)")]
    [InlineData("style", "background: u\\72l(https://evil.example)")]
    [InlineData("style", "@import 'https://evil.example/x.css'")]
    [InlineData("mask", "url(#ok) url(https://evil.example/m.svg#m)")]
    public void Un_url_que_no_apunta_a_un_id_propio_se_descarta(string attribute, string value)
    {
        var root = Parse(Clean($"""<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" {attribute}="{value}"/></svg>"""));
        Assert.Null(root.Descendants(XName.Get("rect", Svg)).Single().Attribute(attribute));
    }

    [Theory]
    // Entidades propias: XXE y billion laughs. La DTD no se procesa, así que la referencia queda sin declarar.
    [InlineData("""<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>""")]
    [InlineData("""<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><text>&b;</text></svg>""")]
    // No es SVG, o no es XML.
    [InlineData("no es svg")]
    [InlineData("""<html><body><svg xmlns="http://www.w3.org/2000/svg"/></body></html>""")]
    [InlineData("""<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>""")]
    [InlineData("""<x:svg xmlns:x="urn:otra-cosa"/>""")]
    public void Lo_que_no_parsea_como_svg_se_rechaza(string svg) => AssertRejected(svg);

    [Fact]
    public void El_doctype_publico_de_illustrator_no_impide_subir_el_logo()
    {
        // Illustrator exporta con el DOCTYPE de SVG 1.1. No se procesa (ni se
        // baja la DTD): solo se descarta.
        var cleaned = Clean("""
            <?xml version="1.0" encoding="utf-8"?>
            <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>
            """);

        Assert.DoesNotContain("DOCTYPE", cleaned, StringComparison.Ordinal);
        Assert.Equal(["svg", "rect"], Names(Parse(cleaned)));
    }

    [Fact]
    public void Comentarios_e_instrucciones_de_procesamiento_no_quedan()
    {
        var cleaned = Clean("""<?xml-stylesheet href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg"><!-- <script>alert(1)</script> --><rect width="1" height="1"/></svg>""");
        Assert.DoesNotContain("xml-stylesheet", cleaned, StringComparison.Ordinal);
        Assert.DoesNotContain("<!--", cleaned, StringComparison.Ordinal);
    }

    [Fact]
    public void Un_svg_sin_namespace_sale_con_el_de_svg()
    {
        var root = Parse(Clean("""<svg width="1" height="1"><rect width="1" height="1"/></svg>"""));
        Assert.All(root.DescendantsAndSelf(), e => Assert.Equal(Svg, e.Name.NamespaceName));
    }

    [Fact]
    public void Un_anidamiento_absurdo_se_rechaza_sin_romper_la_pila()
    {
        var deep = new StringBuilder("""<svg xmlns="http://www.w3.org/2000/svg">""");
        for (var i = 0; i < 5000; i++) deep.Append("<g>");
        for (var i = 0; i < 5000; i++) deep.Append("</g>");
        deep.Append("</svg>");
        AssertRejected(deep.ToString());
    }
}
