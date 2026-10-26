using System.Text;
using Api.Ai;
using Api.Purchasing;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging.Abstractions;
using Purchasing.Infrastructure;
using SharedKernel.Common;
using UnitTests.Api.Ai;

namespace UnitTests.Api.Purchasing;

/// <summary>
/// La cadena de lectura de una factura contra un cliente de chat guionado: cuántas llamadas hace, qué
/// manda y qué hace con lo que vuelve. Ningún test llama a un proveedor real.
/// </summary>
public sealed class InvoiceScannerChainTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);
    private static readonly Guid RemeraId = Guid.NewGuid();
    private static readonly Guid Mancuerna10Id = Guid.NewGuid();
    private static readonly Guid Mancuerna12Id = Guid.NewGuid();

    private static readonly byte[] Pdf = Encoding.Latin1.GetBytes("%PDF-1.4 << /Type /Page >>");

    private static PurchaseOrder Order()
    {
        var order = PurchaseOrder.Create(Guid.NewGuid(), "Importadora del Sur").Value;
        order.SetItems(
        [
            (RemeraId, "Remera algodón", "Negra M", "REM-001", 10, 5m),
            (Mancuerna10Id, "Mancuerna hexagonal", "10 kg", "MAN-10", 10, 5m),
            (Mancuerna12Id, "Mancuerna hexagonal", "12 kg", "MAN-12", 10, 5m),
        ]);
        return order;
    }

    private static string Line(string description, string? code, decimal quantity, decimal unitPrice) =>
        $$"""{ "description": "{{description}}", "code": {{(code is null ? "null" : $"\"{code}\"")}}, "quantity": {{quantity}}, "unitPrice": {{unitPrice}} }""";

    /// <summary>Una factura A que cierra: neto 500.000 + IVA 105.000 = 605.000.</summary>
    private static string Invoice(string lines, string currency = "ARS", string net = "500000") => $$"""
        {
          "supplierName": "Importadora del Sur SRL", "supplierTaxId": "30712345671", "invoiceType": "A",
          "invoiceNumber": "0001-00001234", "invoiceDate": "2026-10-05", "currency": "{{currency}}",
          "netAmount": {{net}}, "vatAmount": 105000, "otherAmount": null, "totalAmount": 605000,
          "lines": [{{lines}}], "confidence": "alta", "warnings": []
        }
        """;

    private static readonly string Valid = Invoice(Line("Remera lisa", "REM-001", 100, 5_000));
    private static readonly string Bad = Invoice(Line("Remera lisa", "REM-001", 100, 4_000));

    private static ChatResponse Reply(string text) => new(new ChatMessage(ChatRole.Assistant, text));

    private static async Task<(Result<InvoiceProposal> Result, FakeChatClient Chat, ChatClientInvoiceModel Model)> Scan(
        PurchaseOrder? order, byte[]? file = null, params string[] script)
    {
        var chat = new FakeChatClient([.. script.Select(Reply)]);
        var model = new ChatClientInvoiceModel(chat);
        var scanner = new InvoiceScanner(model, NullLogger<InvoiceScanner>.Instance);
        var result = await scanner.ScanAsync(file ?? Pdf, "application/pdf", order, Today, CancellationToken.None);
        return (result, chat, model);
    }

    [Fact]
    public async Task Factura_que_cierra_hace_una_sola_llamada()
    {
        var (result, chat, _) = await Scan(Order(), null, Valid);

        var proposal = result.Value;
        Assert.Single(chat.Calls);
        Assert.Empty(proposal.Checks);
        Assert.False(proposal.CorrectionRound);
        Assert.Contains(chat.Calls[0].SelectMany(m => m.Contents).OfType<DataContent>(), d => d.MediaType == "application/pdf");
        Assert.IsType<ChatResponseFormatJson>(chat.Options[0]!.ResponseFormat);
    }

    [Fact]
    public async Task Factura_que_no_cierra_se_corrige_una_vez()
    {
        var (result, chat, model) = await Scan(Order(), null, Bad, Valid);

        Assert.Equal(2, chat.Calls.Count);
        Assert.Contains("400000.00", chat.Calls[1][^1].Text);
        Assert.Contains(chat.Calls[1].SelectMany(m => m.Contents).OfType<DataContent>(), d => d.MediaType == "application/pdf");
        Assert.Empty(result.Value.Checks);
        Assert.True(result.Value.CorrectionRound);
        Assert.True(model.Estimates[1] > model.Estimates[0]);
    }

    [Fact]
    public async Task La_correccion_es_una_sola_aunque_siga_sin_cerrar()
    {
        var (result, chat, _) = await Scan(Order(), null, Bad, Bad, Valid);

        Assert.Equal(2, chat.Calls.Count);
        Assert.Equal("Invoice.LinesVsNet", Assert.Single(result.Value.Checks).Code);
        // Lo leído, no lo recalculado: el código no arregla números.
        Assert.Equal(500_000m, result.Value.Invoice.NetAmount);
        Assert.Equal(100m * 4_000m, result.Value.Invoice.Lines[0].Quantity * result.Value.Invoice.Lines[0].UnitPrice);
    }

    [Fact]
    public async Task Una_correccion_peor_se_descarta()
    {
        var worse = Invoice(Line("Remera lisa", "REM-001", 100, 4_000), currency: "BRL");

        var (result, _, _) = await Scan(Order(), null, Bad, worse);

        Assert.Equal("ARS", result.Value.Invoice.Currency);
        Assert.Single(result.Value.Checks);
        Assert.True(result.Value.CorrectionRound);
    }

    [Fact]
    public async Task Una_correccion_ilegible_se_descarta()
    {
        var (result, _, _) = await Scan(Order(), null, Bad, "no pude");

        Assert.Single(result.Value.Checks);
        Assert.True(result.Value.CorrectionRound);
        Assert.Contains(result.Value.Warnings, w => w.Contains("segunda lectura"));
    }

    [Fact]
    public async Task Respuesta_en_texto_cae_al_parser_tolerante()
    {
        var (result, _, _) = await Scan(Order(), null, $"```json\n{Valid}\n```");

        Assert.True(result.IsSuccess);
        Assert.Equal("0001-00001234", result.Value.Invoice.InvoiceNumber);
    }

    [Fact]
    public async Task Respuesta_ilegible_es_409_y_no_500()
    {
        var (result, _, _) = await Scan(Order(), null, "no es una factura");

        Assert.Equal("Invoice.Unreadable", result.Error.Code);
        Assert.Equal(ErrorType.Conflict, result.Error.Type);
    }

    private static readonly string Ambiguous = Invoice(Line("Mancuerna hexagonal", null, 1, 500_000));

    [Fact]
    public async Task Lineas_ambiguas_van_en_una_sola_llamada()
    {
        var (result, chat, _) = await Scan(Order(), null, Ambiguous, """{ "choices": [{ "line": 0, "candidate": "i3" }] }""");

        Assert.Equal(2, chat.Calls.Count);
        var match = result.Value.Matches[0];
        Assert.Equal(Mancuerna12Id, match.VariantId);
        Assert.Equal(LineMatchMethod.Ai, match.Method);
        Assert.Equal("media", match.Confidence);
    }

    [Fact]
    public async Task Un_candidato_inventado_se_rechaza()
    {
        var (result, _, _) = await Scan(Order(), null, Ambiguous,
            """{ "choices": [{ "line": 0, "candidate": "i9" }, { "line": 7, "candidate": "i2" }] }""");

        var match = Assert.Single(result.Value.Matches);
        Assert.Null(match.VariantId);
        Assert.Equal(LineMatchMethod.None, match.Method);
        Assert.Equal([Mancuerna10Id, Mancuerna12Id], match.Candidates);
    }

    [Fact]
    public async Task Un_candidato_de_otra_linea_no_vale()
    {
        // i1 es la remera: existe en la orden pero no era candidato de esta línea.
        var (result, _, _) = await Scan(Order(), null, Ambiguous, """{ "choices": [{ "line": 0, "candidate": "i1" }] }""");

        Assert.Null(result.Value.Matches[0].VariantId);
    }

    [Fact]
    public async Task Nunca_mas_de_tres_llamadas()
    {
        var bad = Invoice(Line("Mancuerna hexagonal", null, 1, 400_000));

        var (_, chat, _) = await Scan(Order(), null, bad, bad, """{ "choices": [] }""", "sobrante");

        Assert.Equal(3, chat.Calls.Count);
    }

    [Fact]
    public async Task Sin_ambiguas_no_se_pregunta_el_emparejamiento()
    {
        var lines = $"{Line("Remera", "REM-001", 1, 100_000)}, {Line("Mancuerna hexagonal 10kg", null, 4, 100_000)}";

        var (result, chat, _) = await Scan(Order(), null, Invoice(lines));

        Assert.Single(chat.Calls);
        Assert.Equal(RemeraId, result.Value.Matches[0].VariantId);
        Assert.Equal(Mancuerna10Id, result.Value.Matches[1].VariantId);
    }

    [Fact]
    public async Task Si_el_emparejamiento_falla_el_escaneo_sigue()
    {
        // Sin una segunda respuesta guionada, el cliente lanza en la segunda llamada.
        var (result, chat, _) = await Scan(Order(), null, Ambiguous);

        Assert.Equal(2, chat.Calls.Count);
        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Matches[0].VariantId);
        Assert.Equal([Mancuerna10Id, Mancuerna12Id], result.Value.Matches[0].Candidates);
        Assert.Contains(result.Value.Warnings, w => w.StartsWith("No se pudieron emparejar", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Mas_de_20_paginas_no_llama_al_modelo()
    {
        var pdf = Encoding.Latin1.GetBytes("%PDF-1.4 " + string.Concat(Enumerable.Repeat("<< /Type /Page >> ", 21)));

        var (result, chat, _) = await Scan(Order(), pdf, Valid);

        Assert.Equal("Invoice.TooManyPages", result.Error.Code);
        Assert.Empty(chat.Calls);
    }

    [Fact]
    public async Task Sin_orden_no_hay_emparejamiento_pero_si_lectura()
    {
        var (result, chat, _) = await Scan(null, null, Valid);

        Assert.Single(chat.Calls);
        Assert.Equal(LineMatchMethod.None, Assert.Single(result.Value.Matches).Method);
    }

    // ---- Ronda de arreglos de la revisión final ----

    /// <summary>Un modelo que ejecuta un paso por llamada: sirve para demorar o fallar a pedido.</summary>
    private sealed class StepModel(params Func<CancellationToken, Task<Result<ChatResponse>>>[] steps) : IInvoiceModel
    {
        public int Calls { get; private set; }

        public Task<Result<ChatResponse>> AskAsync(
            string system, IReadOnlyList<ChatMessage> conversation, ChatResponseFormat format,
            int estimatedInputTokens, CancellationToken ct) => steps[Calls++](ct);
    }

    private static Func<CancellationToken, Task<Result<ChatResponse>>> Says(string text) =>
        _ => Task.FromResult(Result.Success(Reply(text)));

    private static Func<CancellationToken, Task<Result<ChatResponse>>> Fails(Error error) =>
        _ => Task.FromResult(Result.Failure<ChatResponse>(error));

    private static Func<CancellationToken, Task<Result<ChatResponse>>> Hangs() =>
        async ct =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return Result.Success(Reply("nunca"));
        };

    private static Task<Result<InvoiceProposal>> ScanWith(StepModel model, TimeSpan budget, CancellationToken ct = default) =>
        new InvoiceScanner(model, NullLogger<InvoiceScanner>.Instance) { Budget = budget }
            .ScanAsync(Pdf, "application/pdf", Order(), Today, ct);

    [Fact]
    public async Task Una_linea_null_en_el_array_del_modelo_no_rompe()
    {
        var (result, _, _) = await Scan(Order(), null, Invoice("null"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Invoice.Lines);
    }

    [Fact]
    public async Task Una_eleccion_null_en_el_emparejamiento_no_rompe()
    {
        var (result, chat, _) = await Scan(Order(), null, Ambiguous, """{ "choices": [null] }""");

        Assert.Equal(2, chat.Calls.Count);
        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Matches[0].VariantId);
    }

    [Fact]
    public async Task El_emparejamiento_tolera_un_bloque_de_codigo()
    {
        var (result, _, _) = await Scan(Order(), null, Ambiguous, "```json\n{ \"choices\": [{ \"line\": 0, \"candidate\": \"i3\" }] }\n```");

        Assert.Equal(Mancuerna12Id, result.Value.Matches[0].VariantId);
        Assert.DoesNotContain(result.Value.Warnings, w => w.StartsWith("No se pudieron emparejar", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Si_vence_el_plazo_en_la_correccion_queda_la_primera_lectura_con_aviso()
    {
        var model = new StepModel(Says(Bad), Hangs());

        var result = await ScanWith(model, TimeSpan.FromMilliseconds(150));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, model.Calls);
        Assert.Single(result.Value.Checks);
        Assert.False(result.Value.CorrectionRound);
        Assert.Contains(result.Value.Warnings, w => w.Contains("tardó demasiado") && w.Contains("segunda lectura"));
    }

    [Fact]
    public async Task Si_vence_el_plazo_en_el_emparejamiento_se_devuelve_lo_leido()
    {
        var model = new StepModel(Says(Ambiguous), Hangs());

        var result = await ScanWith(model, TimeSpan.FromMilliseconds(150));

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Matches[0].VariantId);
        Assert.Contains(result.Value.Warnings, w => w.Contains("tardó demasiado") && w.Contains("emparejamiento"));
    }

    [Fact]
    public async Task Cancelar_el_request_no_es_un_plazo_vencido()
    {
        using var cts = new CancellationTokenSource();
        var model = new StepModel(Says(Bad), Hangs());

        var task = ScanWith(model, TimeSpan.FromMinutes(5), cts.Token);
        await Task.Delay(50);
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    [Theory]
    [InlineData("Ai.TimedOut")]
    [InlineData("Ai.Unavailable")]
    public async Task Si_la_correccion_cayo_por_la_IA_no_se_intenta_emparejar_con_IA(string code)
    {
        var error = code == "Ai.TimedOut" ? AiErrors.TimedOut : AiErrors.Unavailable;
        var badAmbiguous = Invoice(Line("Mancuerna hexagonal", null, 1, 400_000));
        var model = new StepModel(Says(badAmbiguous), Fails(error), Says("""{ "choices": [{ "line": 0, "candidate": "i3" }] }"""));

        var result = await ScanWith(model, TimeSpan.FromMinutes(5));

        Assert.Equal(2, model.Calls);
        Assert.Null(result.Value.Matches[0].VariantId);
        Assert.Contains(result.Value.Warnings, w => w.Contains("segunda lectura"));
        Assert.Contains(result.Value.Warnings, w => w.Contains("emparejamiento con IA"));
    }

    [Fact]
    public async Task Otro_error_de_la_correccion_si_deja_emparejar_con_IA()
    {
        var badAmbiguous = Invoice(Line("Mancuerna hexagonal", null, 1, 400_000));
        var model = new StepModel(Says(badAmbiguous), Fails(AiErrors.Failed), Says("""{ "choices": [{ "line": 0, "candidate": "i3" }] }"""));

        var result = await ScanWith(model, TimeSpan.FromMinutes(5));

        Assert.Equal(3, model.Calls);
        Assert.Equal(Mancuerna12Id, result.Value.Matches[0].VariantId);
    }

    [Fact]
    public async Task Una_linea_sin_candidatos_no_genera_el_aviso_de_sin_emparejar()
    {
        var lines = $"{Line("Flete", null, 1, 100_000)}, {Line("Remera", "REM-001", 1, 100_000)}";

        var (result, _, _) = await Scan(Order(), null, Invoice(lines));

        Assert.DoesNotContain(result.Value.Warnings, w => w.Contains("sin emparejar"));
        Assert.Null(result.Value.Matches[0].VariantId);
    }

    [Fact]
    public async Task Una_linea_con_candidatos_que_la_IA_no_resolvio_si_avisa()
    {
        var (result, _, _) = await Scan(Order(), null, Ambiguous, """{ "choices": [] }""");

        Assert.Contains(result.Value.Warnings, w => w.Contains("1 línea sin emparejar"));
    }

    [Fact]
    public async Task Respuesta_cortada_por_largo_tiene_mensaje_propio()
    {
        var truncated = new ChatResponse(new ChatMessage(ChatRole.Assistant, "{ \"lines\": [{ \"descr")) { FinishReason = ChatFinishReason.Length };
        var model = new StepModel(_ => Task.FromResult(Result.Success(truncated)));

        var result = await ScanWith(model, TimeSpan.FromMinutes(5));

        Assert.Equal("Invoice.TooLong", result.Error.Code);
        Assert.Equal(ErrorType.Conflict, result.Error.Type);
        Assert.Contains("muy larga", result.Error.Message);
    }
}
