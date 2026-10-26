using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace Api.Purchasing;

/// <summary>
/// Cuántos tokens va a costar leer una factura, por lo alto: con eso el gateway reserva el peor caso del
/// tope mensual y al terminar descuenta lo real. Un PDF cuesta por página (hasta 3.000 de texto más ~1.600
/// de imagen en Anthropic); una imagen, un fijo (todos los proveedores la reescalan).
/// </summary>
public static partial class InvoiceTokenEstimate
{
    public const int TokensPerPdfPage = 4_500;
    public const int TokensPerImage = 2_000;
    public const int BytesPerPageFallback = 100_000;

    /// <summary>Más páginas que esto no es una factura, y la reserva no lo cubriría.</summary>
    public const int MaxPdfPages = 20;

    /// <summary>Tope de lo que se infla al buscar páginas: contra un stream que descomprime a gigas.</summary>
    public const int MaxInflatedBytes = 20 * 1024 * 1024;

    /// <summary>
    /// Cuenta los objetos <c>/Type /Page</c> (no <c>/Pages</c>, el árbol), a la vista y dentro de los object
    /// streams <c>/ObjStm</c> comprimidos con FlateDecode, donde un PDF 1.5 o posterior (Word, Chrome) guarda
    /// los diccionarios de página. Si no aparece ninguno se estima por el peso: una página cada 100 KB,
    /// mínimo una.
    /// </summary>
    public static int PdfPages(byte[] pdf)
    {
        var text = Encoding.Latin1.GetString(pdf);
        var marks = PageMark().Count(text) + PagesInObjectStreams(pdf, text);
        return marks > 0 ? marks : Math.Max(1, (int)Math.Ceiling(pdf.Length / (double)BytesPerPageFallback));
    }

    /// <summary>
    /// Infla los object streams y cuenta ahí. Latin1 es un byte por carácter: un índice del texto es un
    /// índice del arreglo. Un stream que no se puede inflar se saltea: la estimación nunca lanza.
    /// </summary>
    private static int PagesInObjectStreams(byte[] pdf, string text)
    {
        var pages = 0;
        var budget = MaxInflatedBytes;
        var from = 0;
        while (budget > 0 && text.IndexOf("/ObjStm", from, StringComparison.Ordinal) is var mark and >= 0)
        {
            from = mark + 1;
            var open = text.IndexOf("stream", mark, StringComparison.Ordinal);
            if (open < 0) break;

            // El diccionario es lo que hay entre la marca y la palabra "stream" (que no sea "endstream").
            var dictionary = text.AsSpan(mark, open - mark);
            if (!dictionary.Contains("/FlateDecode", StringComparison.Ordinal)) continue;

            var start = open + "stream".Length;
            if (start < text.Length && text[start] == '\r') start++;
            if (start < text.Length && text[start] == '\n') start++;
            var end = text.IndexOf("endstream", start, StringComparison.Ordinal);
            if (end < 0) end = text.Length;

            var inflated = Inflate(pdf.AsMemory(start, end - start), budget);
            budget -= inflated.Length;
            pages += PageMark().Count(Encoding.Latin1.GetString(inflated));
            from = Math.Max(from, end);
        }

        return pages;
    }

    /// <summary>Hasta <paramref name="limit"/> bytes inflados; lo que no se pueda leer (corrupto, cortado) devuelve lo ya leído.</summary>
    private static byte[] Inflate(ReadOnlyMemory<byte> compressed, int limit)
    {
        using var output = new MemoryStream();
        try
        {
            using var input = new MemoryStream(compressed.ToArray());
            using var zlib = new ZLibStream(input, CompressionMode.Decompress);
            var chunk = new byte[81_920];
            int read;
            while (output.Length < limit && (read = zlib.Read(chunk, 0, (int)Math.Min(chunk.Length, limit - output.Length))) > 0)
                output.Write(chunk, 0, read);
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            // Corrupto o cortado: vale lo que se alcanzó a leer.
        }

        return output.ToArray();
    }

    /// <summary>Páginas × 4.500 o 2.000 por imagen, más el prompt (caracteres / 3 hacia arriba).</summary>
    public static int ForFile(byte[] file, string mediaType, int promptChars) =>
        (mediaType == "application/pdf" ? PdfPages(file) * TokensPerPdfPage : TokensPerImage) + ForText(promptChars);

    /// <summary>La corrección manda el archivo de nuevo, la respuesta anterior y el pedido de corrección.</summary>
    public static int ForCorrection(int firstEstimate, int previousAnswerChars, int correctionChars) =>
        firstEstimate + ForText(previousAnswerChars) + ForText(correctionChars);

    /// <summary>Texto solo (el emparejamiento): caracteres / 3 hacia arriba.</summary>
    public static int ForText(int promptChars) => (promptChars + 2) / 3;

    [GeneratedRegex(@"/Type\s*/Page(?![s\w])")]
    private static partial Regex PageMark();
}
