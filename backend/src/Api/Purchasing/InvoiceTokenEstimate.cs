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

    /// <summary>
    /// Cuenta los objetos <c>/Type /Page</c> (no <c>/Pages</c>, el árbol). Si no aparece ninguno (páginas
    /// dentro de flujos comprimidos) se estima por el peso: una página cada 100 KB, mínimo una.
    /// </summary>
    public static int PdfPages(byte[] pdf)
    {
        var marks = PageMark().Count(Encoding.Latin1.GetString(pdf));
        return marks > 0 ? marks : Math.Max(1, (int)Math.Ceiling(pdf.Length / (double)BytesPerPageFallback));
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
