using System.Text.Json;
using Api.Ai;
using Microsoft.Extensions.AI;
using Purchasing.Infrastructure;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// Lee la factura del proveedor —PDF o foto— y PROPONE los datos del comprobante, con una cadena corta:
/// extraer con salida estructurada, validar en código, a lo sumo UNA corrección y emparejar las líneas con
/// los ítems de la orden (primero en código; solo las ambiguas, una sola vez, con la IA). Son de una a tres
/// llamadas al modelo, cada una su propia ejecución del gateway, que reserva el peor caso del tope.
///
/// Propone y no guarda, a propósito. Un número de factura mal leído entra derecho al libro de IVA y a la
/// cuenta corriente del proveedor: que alguien mire la pantalla antes de confirmar cuesta cinco segundos y
/// evita corregirlo tres meses después. El archivo tampoco se guarda: entra, sale la propuesta.
///
/// Lo que viene del archivo es dato, no órdenes. El modelo solo propone, y al emparejar solo puede elegir
/// entre los candidatos que le damos; el código nunca "arregla" un número para que cierre.
/// </summary>
public sealed class InvoiceScanner(IInvoiceModel model, ILogger<InvoiceScanner> logger)
{
    /// <summary>10 MB. Una factura escaneada pesa menos de 1; más que esto es una foto sin comprimir.</summary>
    public const long MaxBytes = 10 * 1024 * 1024;

    /// <summary>
    /// Plazo total del escaneo. Cada llamada tiene su reloj (el de la tarea, 120 s, y otro tanto con el
    /// respaldo), pero la cadena puede encadenar tres: sin un tope total el pedido quedaría minutos
    /// abierto con el archivo en memoria. Vale para la corrección y el emparejamiento; la primera lectura
    /// corre con el reloj de la tarea, que es el que la acota.
    /// </summary>
    public static readonly TimeSpan DefaultBudget = TimeSpan.FromSeconds(180);

    /// <summary>Por propiedad y no por parámetro para que el contenedor lo ignore; los tests lo acortan.</summary>
    internal TimeSpan Budget { get; init; } = DefaultBudget;

    public static readonly string[] AllowedMediaTypes =
        ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    public Task<Result<InvoiceProposal>> ScanAsync(
        byte[] file, string mediaType, PurchaseOrder? order, CancellationToken ct) =>
        ScanAsync(file, mediaType, order, ArgentinaTime.Today, ct);

    /// <param name="todayAr">"Hoy" para el control de fecha futura; por parámetro para probar sin reloj.</param>
    internal async Task<Result<InvoiceProposal>> ScanAsync(
        byte[] file, string mediaType, PurchaseOrder? order, DateOnly todayAr, CancellationToken ct)
    {
        if (file.Length == 0)
            return Result.Failure<InvoiceProposal>(Error.Validation("Invoice.Empty", "El archivo está vacío."));

        if (file.LongLength > MaxBytes)
            return Result.Failure<InvoiceProposal>(Error.Validation(
                "Invoice.TooLarge", "El archivo supera los 10 MB. Probá con un escaneo de menor resolución."));

        if (!AllowedMediaTypes.Contains(mediaType))
            return Result.Failure<InvoiceProposal>(Error.Validation(
                "Invoice.BadType", "Subí la factura en PDF o como imagen (JPG, PNG o WEBP)."));

        if (mediaType == "application/pdf" && InvoiceTokenEstimate.PdfPages(file) > InvoiceTokenEstimate.MaxPdfPages)
            return Result.Failure<InvoiceProposal>(Error.Validation(
                "Invoice.TooManyPages", "La factura tiene más de 20 páginas: subí solo las del comprobante."));

        // 1. Extraer. El archivo primero: el modelo lee mejor la consigna sabiendo ya qué tiene delante.
        // Los bytes viajan al proveedor y no se guardan en ningún lado.
        var prompt = InvoicePrompts.ExtractUser(order);
        var original = new ChatMessage(ChatRole.User, [new DataContent(file, mediaType), new TextContent(prompt)]);
        var firstEstimate = InvoiceTokenEstimate.ForFile(file, mediaType, InvoicePrompts.ExtractSystem.Length + prompt.Length);
        var first = await model.AskAsync(
            InvoicePrompts.ExtractSystem, [original], InvoicePrompts.ExtractionFormat, firstEstimate, ct);
        if (first.IsFailure) return Result.Failure<InvoiceProposal>(first.Error);

        // El plazo total corre desde que terminó la primera lectura.
        using var deadlineSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadlineSource.CancelAfter(Budget);
        var deadline = deadlineSource.Token;

        var firstText = first.Value.FinalText();
        var invoice = InvoiceResponseParser.Parse(firstText);
        if (invoice is null)
        {
            logger.LogWarning("Factura: respuesta de la IA no parseable: {Body}", Text.Clip(firstText, 400));
            // Cortada por el largo de salida: reintentar da lo mismo; hay que partir la factura.
            if (first.Value.FinishReason == ChatFinishReason.Length)
                return Result.Failure<InvoiceProposal>(Error.Conflict(
                    "Invoice.TooLong",
                    "La factura es muy larga para leerla de una vez. Subí solo las páginas con los renglones, o cargá los datos a mano."));
            // 409 y no 500: el modelo contestó algo que no es la factura; se puede cargar a mano o reintentar.
            return Result.Failure<InvoiceProposal>(Error.Conflict(
                "Invoice.Unreadable", "No se pudo interpretar la respuesta. Cargá los datos a mano."));
        }

        // 2. Validar en código.
        var issues = InvoiceValidator.Validate(invoice, todayAr);
        var chainWarnings = new List<string>();
        var correctionRound = false;

        // 3. Una sola corrección, diciendo exactamente qué no cierra. Nunca una tercera lectura.
        var aiDown = false;
        if (issues.Count > 0)
        {
            var correction = InvoicePrompts.CorrectionUser(issues);
            var second = await AskWithinBudgetAsync(
                InvoicePrompts.ExtractSystem,
                [original, new ChatMessage(ChatRole.Assistant, firstText), new ChatMessage(ChatRole.User, correction)],
                InvoicePrompts.ExtractionFormat,
                InvoiceTokenEstimate.ForCorrection(firstEstimate, firstText.Length, correction.Length),
                ct, deadline);

            if (second is null)
            {
                aiDown = true;
                chainWarnings.Add("La lectura tardó demasiado: no se hizo la segunda lectura.");
            }
            else if (second.IsFailure)
            {
                // Si la IA no respondió, preguntarle de nuevo para emparejar es otra espera larga para nada.
                aiDown = second.Error.Code is "Ai.TimedOut" or "Ai.Unavailable";
                chainWarnings.Add($"No se pudo hacer la segunda lectura: {second.Error.Message}");
            }
            else
            {
                correctionRound = true;
                var secondText = second.Value.FinalText();
                var reread = InvoiceResponseParser.Parse(secondText);
                if (reread is null)
                {
                    logger.LogWarning("Factura: segunda lectura no parseable: {Body}", Text.Clip(secondText, 400));
                    chainWarnings.Add("La segunda lectura no se pudo interpretar: queda la primera.");
                }
                else
                {
                    var rereadIssues = InvoiceValidator.Validate(reread, todayAr);
                    if (rereadIssues.Count > issues.Count)
                    {
                        chainWarnings.Add("La segunda lectura cerraba peor que la primera: queda la primera.");
                    }
                    else
                    {
                        invoice = reread;
                        issues = rereadIssues;
                    }
                }
            }
        }

        // 4. Emparejar las líneas con los ítems de la orden.
        var matches = await MatchAsync(invoice, order, aiDown, chainWarnings, ct, deadline);

        return new InvoiceProposal(invoice, issues, correctionRound, matches, [.. invoice.Warnings, .. chainWarnings]);
    }

    /// <summary>
    /// Una llamada al modelo dentro del plazo total. Devuelve null si venció ESE plazo; si el que se canceló
    /// es el request (la persona cerró la pantalla), la excepción sigue de largo como siempre.
    /// </summary>
    private async Task<Result<ChatResponse>?> AskWithinBudgetAsync(
        string system, IReadOnlyList<ChatMessage> conversation, ChatResponseFormat format,
        int estimatedInputTokens, CancellationToken ct, CancellationToken deadline)
    {
        try
        {
            return await model.AskAsync(system, conversation, format, estimatedInputTokens, deadline);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && deadline.IsCancellationRequested)
        {
            return null;
        }
    }

    private async Task<IReadOnlyList<InvoiceLineMatch>> MatchAsync(
        ScannedInvoice invoice, PurchaseOrder? order, bool aiDown, List<string> warnings,
        CancellationToken ct, CancellationToken deadline)
    {
        if (order is null || invoice.Lines.Count == 0)
            return [.. invoice.Lines.Select((_, i) => new InvoiceLineMatch(i, null, LineMatchMethod.None, "baja", []))];

        var items = InvoiceLineMatcher.ItemsOf(order);
        var plan = InvoiceLineMatcher.Plan(invoice.Lines, items);
        var matches = plan.Matches.ToList();

        if (plan.AskAi.Count > 0 && aiDown)
        {
            warnings.Add("Se salteó el emparejamiento con IA porque el servicio no respondía: elegí el ítem a mano.");
        }
        else if (plan.AskAi.Count > 0)
        {
            var user = InvoicePrompts.MatchUser(invoice.Lines, plan.AskAi, items, matches);
            var answer = await AskWithinBudgetAsync(
                InvoicePrompts.MatchSystem,
                [new ChatMessage(ChatRole.User, user)],
                InvoicePrompts.MatchFormat,
                InvoiceTokenEstimate.ForText(InvoicePrompts.MatchSystem.Length + user.Length),
                ct, deadline);

            if (answer is null)
            {
                warnings.Add("La lectura tardó demasiado: no se hizo el emparejamiento con IA. Elegí el ítem a mano.");
            }
            else
            {
                var choices = answer.IsSuccess ? ReadChoices(answer.Value.FinalText()) : null;
                if (choices is null)
                {
                    warnings.Add("No se pudieron emparejar con la IA las líneas dudosas: elegí el ítem a mano.");
                }
                else
                {
                    foreach (var choice in choices.Where(c => c is not null))
                        Apply(choice, plan.AskAi, matches, items);
                }
            }
        }

        // Solo cuentan las que tenían candidatos y quedaron sin elegir: una línea sin ninguno (un flete) es
        // lo esperable y el badge de esa línea ya lo dice.
        var unmatched = matches.Count(m => m.VariantId is null && m.Candidates.Count > 0);
        if (unmatched > 0)
            warnings.Add(unmatched == 1
                ? "Quedó 1 línea sin emparejar: elegí el ítem a mano."
                : $"Quedaron {unmatched} líneas sin emparejar: elegí el ítem a mano.");

        return matches;
    }

    /// <summary>
    /// Una elección vale solo si la línea era una de las que se preguntaron y la clave es una de sus candidatos:
    /// cualquier otra cosa que invente el modelo se ignora y la línea queda sin emparejar.
    /// </summary>
    private static void Apply(
        LineChoice choice, IReadOnlyList<int> asked, List<InvoiceLineMatch> matches, IReadOnlyList<OrderItemRef> items)
    {
        if (choice.Candidate is null || !asked.Contains(choice.Line)) return;
        var current = matches[choice.Line];
        if (current.VariantId is not null) return;

        var chosen = current.Candidates
            .Select(id => items.Select((item, index) => (item, index)).First(x => x.item.VariantId == id))
            .FirstOrDefault(x => string.Equals(InvoicePrompts.ItemKey(x.index), choice.Candidate.Trim(), StringComparison.OrdinalIgnoreCase));
        if (chosen.item is null) return;

        matches[choice.Line] = current with { VariantId = chosen.item.VariantId, Method = LineMatchMethod.Ai, Confidence = "media" };
    }

    private static IReadOnlyList<LineChoice>? ReadChoices(string text)
    {
        try
        {
            return InvoiceResponseParser.Unfence(text) is { } json
                ? JsonSerializer.Deserialize<LineChoiceAnswer>(json, JsonSerializerOptions.Web)?.Choices
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
