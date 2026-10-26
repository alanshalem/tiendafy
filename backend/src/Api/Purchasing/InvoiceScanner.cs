using System.Text.RegularExpressions;
using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;
using Purchasing.Infrastructure;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// Lee la factura del proveedor —PDF o foto— y PROPONE los datos del
/// comprobante.
///
/// Cargar a mano tipo, número, fecha, neto e IVA de cada factura es el trabajo
/// más repetitivo del circuito de compras y el que más errores de tipeo mete en
/// el libro de IVA. La AI ya está en el sistema para otras cosas, así que esto
/// es de lo más barato que se puede agregar.
///
/// Propone y no guarda, a propósito. Un número de factura mal leído entra
/// derecho al libro de IVA y a la cuenta corriente del proveedor: que alguien
/// mire la pantalla antes de confirmar cuesta cinco segundos y evita corregirlo
/// tres meses después. El archivo tampoco se guarda: entra, sale la propuesta,
/// y lo que queda registrado es lo que la persona confirmó.
/// </summary>
public sealed partial class InvoiceScanner(IAiGateway gateway, ILogger<InvoiceScanner> logger)
{
    /// <summary>10 MB. Una factura escaneada pesa menos de 1; más que esto es una foto sin comprimir.</summary>
    public const long MaxBytes = 10 * 1024 * 1024;

    public static readonly string[] AllowedMediaTypes =
        ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    private const string SystemPrompt = """
        Sos un asistente que lee facturas de compra argentinas y extrae sus datos.
        Respondés SIEMPRE con un único objeto JSON, sin texto alrededor y sin bloques de código.

        Campos:
        - supplierName: razón social de quien EMITE la factura (el proveedor), o null.
        - supplierTaxId: CUIT del emisor, solo dígitos, sin guiones, o null.
        - invoiceType: "A", "B", "C", "E" o "M" según la letra del comprobante, o null.
        - invoiceNumber: punto de venta y número como figura, formato "0001-00001234", o null.
        - invoiceDate: fecha de emisión en formato AAAA-MM-DD, o null.
        - currency: "ARS" o "USD".
        - netAmount: neto gravado (sin IVA) como número decimal, o null.
        - vatAmount: suma de TODAS las alícuotas de IVA como número decimal, o null.
        - totalAmount: total del comprobante como número decimal, o null.
        - lines: array de { description, quantity, unitPrice } con las líneas del detalle. Vacío si no se leen.
        - confidence: "alta", "media" o "baja" según qué tan legible está el comprobante.
        - warnings: array de textos cortos en castellano con lo que no pudiste leer o te resultó ambiguo.

        Reglas:
        - Los números van SIN separador de miles y con punto decimal: 12345.67.
        - Si un dato no está o no se lee con seguridad, poné null y explicá por qué en warnings.
          Nunca inventes un número ni completes con un valor aproximado.
        - En Argentina la factura B no discrimina IVA: en ese caso netAmount y vatAmount van en null
          y totalAmount lleva el total.
        - Si el archivo no es una factura, devolvé todos los campos en null, confidence "baja"
          y un warning diciendo qué es.
        """;

    public async Task<Result<ScannedInvoice>> ScanAsync(
        byte[] file, string mediaType, PurchaseOrder? order, CancellationToken ct)
    {
        if (file.Length == 0)
            return Result.Failure<ScannedInvoice>(Error.Validation("Invoice.Empty", "El archivo está vacío."));

        if (file.LongLength > MaxBytes)
            return Result.Failure<ScannedInvoice>(Error.Validation(
                "Invoice.TooLarge", "El archivo supera los 10 MB. Probá con un escaneo de menor resolución."));

        if (!AllowedMediaTypes.Contains(mediaType))
            return Result.Failure<ScannedInvoice>(Error.Validation(
                "Invoice.BadType", "Subí la factura en PDF o como imagen (JPG, PNG o WEBP)."));

        // Lo que ya sabemos de la orden entra como contexto: con el proveedor y
        // el total esperado delante, el modelo corrige mejor un dígito borroso
        // que leyendo la factura sola.
        var prompt = order is null
            ? "Leé esta factura de compra y devolvé el JSON."
            : $"""
               Leé esta factura de compra y devolvé el JSON.

               Contexto de la orden de compra con la que se va a asociar (puede no coincidir,
               es solo referencia — NO completes con estos datos lo que no puedas leer):
               - Proveedor esperado: {order.SupplierName}
               - Referencia: {order.Reference ?? "sin referencia"}
               - Moneda de la orden: {order.Currency}
               - Ítems: {order.Items.Count}
               """;

        // El archivo primero: el modelo lee mejor la consigna sabiendo ya qué tiene delante. Los bytes
        // viajan al proveedor y no se guardan en ningún lado.
        var message = new ChatMessage(ChatRole.User, [new DataContent(file, mediaType), new TextContent(prompt)]);
        var options = new AiRunOptions(EstimateInputTokens(file, mediaType) + (SystemPrompt.Length + prompt.Length) / 3);
        var response = await gateway.RunAsync(
            AiTask.InvoiceRead,
            options,
            async (run, token) =>
                (await run.Chat.GetResponseAsync([run.System(SystemPrompt), message], run.NewOptions(), token)).Text,
            ct);
        if (response.IsFailure) return Result.Failure<ScannedInvoice>(response.Error);

        var parsed = InvoiceResponseParser.Parse(response.Value);
        if (parsed is null)
        {
            logger.LogWarning("Factura: respuesta de la IA no parseable: {Body}", Text.Clip(response.Value, 400));
            // 409 y no 500: el modelo contestó algo que no es la factura; se puede cargar a mano o reintentar.
            return Result.Failure<ScannedInvoice>(Error.Conflict(
                "Invoice.Unreadable", "No se pudo interpretar la respuesta. Cargá los datos a mano."));
        }

        return parsed;
    }

    /// <summary>
    /// Tokens que cuesta el archivo, por lo alto (con eso se reserva el peor caso del tope; lo real se
    /// descuenta al terminar). Un PDF cuesta unos 1500 por página: se cuentan los objetos /Type /Page
    /// (barato, sin abrir el PDF). Si no se pueden contar (páginas dentro de flujos comprimidos) o es una
    /// imagen, 1500 por cada 100 KB: bytes / 3 sería muy alto para un PDF, que casi todo es compresión.
    /// </summary>
    internal static int EstimateInputTokens(byte[] file, string mediaType)
    {
        const int TokensPerUnit = 1500;
        if (mediaType == "application/pdf")
        {
            var pages = PdfPage().Count(System.Text.Encoding.Latin1.GetString(file));
            if (pages > 0) return pages * TokensPerUnit;
        }

        return Math.Max(1, (int)Math.Ceiling(file.Length / 102_400d)) * TokensPerUnit;
    }

    [GeneratedRegex(@"/Type\s*/Page(?![s\w])")]
    private static partial Regex PdfPage();
}
