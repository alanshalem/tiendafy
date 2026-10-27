using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Ai.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La lectura encadenada de una factura de compra por el endpoint de verdad, con el gateway, el medidor y el
/// consumo de producción y un modelo guionizado: cuántas llamadas hace, qué consumo deja y que el archivo
/// no se guarda en ningún lado.
/// </summary>
[Collection("api")]
public sealed class InvoiceScanFlowTests(ApiFactory factory)
{
    private static readonly byte[] Pdf = "%PDF-1.4 << /Type /Page >> factura"u8.ToArray();

    private static string Invoice(decimal unitPrice) => JsonSerializer.Serialize(new
    {
        supplierName = "Importadora del Sur SRL",
        supplierTaxId = "30712345671",
        invoiceType = "A",
        invoiceNumber = "0001-00001234",
        invoiceDate = "2026-10-05",
        currency = "ARS",
        netAmount = 500_000m,
        vatAmount = 105_000m,
        otherAmount = (decimal?)null,
        totalAmount = 605_000m,
        lines = new[] { new { description = "Remeras", code = "REM-001", quantity = 100, unitPrice } },
        confidence = "alta",
        warnings = Array.Empty<string>(),
    });

    private async Task<(Merchant Merchant, Guid OrderId, Guid RemeraVariant)> OrderAsync(string slug, bool ai = true)
    {
        var merchant = await Merchant.CreateAsync(factory, slug);
        var (_, remera) = await merchant.CreateProductAsync("Remera lisa", sku: "REM-001");
        var (_, man10) = await merchant.CreateProductAsync("Mancuerna hexagonal 10 kg", sku: "MAN-10");
        var (_, man12) = await merchant.CreateProductAsync("Mancuerna hexagonal 12 kg", sku: "MAN-12");
        var order = await merchant.PostAsync("/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "Importadora del Sur",
            currency = "ARS",
            exchangeRate = 1m,
            items = new[]
            {
                new { variantId = remera, quantity = 100, unitCost = 5_000m },
                new { variantId = man10, quantity = 10, unitCost = 1_000m },
                new { variantId = man12, quantity = 10, unitCost = 1_200m },
            },
        });
        if (ai) await AiSetup.ConfigureAsync(merchant, (AiTask.InvoiceRead, AiSetup.Sonnet));
        return (merchant, order.GetProperty("id").GetGuid(), remera);
    }

    private static async Task<HttpResponseMessage> ScanAsync(Merchant merchant, Guid orderId)
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(Pdf) { Headers = { ContentType = new MediaTypeHeaderValue("application/pdf") } }, "file", "factura.pdf" },
        };
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{orderId}/invoice/scan") { Content = form };
        request.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        return await merchant.Client.SendAsync(request);
    }

    private async Task<List<AiUsage>> UsageAsync(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        return await db.Usage.IgnoreQueryFilters().AsNoTracking().Where(u => u.TenantId == tenantId && u.Task == AiTask.InvoiceRead).ToListAsync();
    }

    [Fact]
    public async Task Escanear_manda_el_pdf_y_devuelve_controles_y_emparejamiento()
    {
        var (merchant, orderId, remera) = await OrderAsync("invscan1");
        var bad = AiSetup.Reply(Invoice(4_000m));
        factory.Ai.Respond(AiSetup.Sonnet, bad, bad);

        var response = await ScanAsync(merchant, orderId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invoice.LinesVsNet", body.GetProperty("checks")[0].GetProperty("code").GetString());
        Assert.True(body.GetProperty("correctionRound").GetBoolean());
        var match = body.GetProperty("lines")[0].GetProperty("match");
        Assert.Equal(remera, match.GetProperty("variantId").GetGuid());
        Assert.Equal("code", match.GetProperty("method").GetString());
        Assert.Equal("alta", match.GetProperty("confidence").GetString());
        Assert.Equal("REM-001", body.GetProperty("lines")[0].GetProperty("code").GetString());

        var first = factory.Ai.Calls(AiSetup.Sonnet)[0];
        Assert.Equal("application/pdf", first.SelectMany(m => m.Contents).OfType<DataContent>().Single().MediaType);
    }

    [Fact]
    public async Task Cada_llamada_es_una_ejecucion()
    {
        var (merchant, orderId, _) = await OrderAsync("invscan2");
        var bad = AiSetup.Reply(Invoice(4_000m));
        factory.Ai.Respond(AiSetup.Sonnet, bad, bad);

        Assert.Equal(HttpStatusCode.OK, (await ScanAsync(merchant, orderId)).StatusCode);

        var usage = await UsageAsync(merchant.TenantId);
        Assert.Equal(2, usage.Count);
        Assert.Equal(2, usage.Select(u => u.RunId).Distinct().Count());
    }

    [Fact]
    public async Task Factura_que_cierra_una_sola_llamada()
    {
        var (merchant, orderId, _) = await OrderAsync("invscan3");
        factory.Ai.Respond(AiSetup.Sonnet, AiSetup.Reply(Invoice(5_000m)));

        var response = await ScanAsync(merchant, orderId);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(body.GetProperty("checks").EnumerateArray());
        Assert.False(body.GetProperty("correctionRound").GetBoolean());
        Assert.Single(factory.Ai.Calls(AiSetup.Sonnet));
    }

    [Fact]
    public async Task El_archivo_no_se_guarda()
    {
        var (merchant, orderId, _) = await OrderAsync("invscan4");
        factory.Ai.Respond(AiSetup.Sonnet, AiSetup.Reply(Invoice(5_000m)));
        var before = factory.ExternalHttp.SentTo(ApiFactory.Storage).Count;

        Assert.Equal(HttpStatusCode.OK, (await ScanAsync(merchant, orderId)).StatusCode);

        Assert.Equal(before, factory.ExternalHttp.SentTo(ApiFactory.Storage).Count);
    }

    [Fact]
    public async Task Sin_modelo_para_la_tarea_explica_por_que()
    {
        var (merchant, orderId, _) = await OrderAsync("invscan5", ai: false);
        await AiSetup.ConfigureAsync(merchant, (AiTask.ShortText, AiSetup.Haiku));
        factory.Ai.Respond(AiSetup.Sonnet);

        var response = await ScanAsync(merchant, orderId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Ai.TaskNotConfigured", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Empty(factory.Ai.Calls(AiSetup.Sonnet));
    }

    [Fact]
    public async Task Escanear_la_orden_de_otra_tienda_es_404_y_no_llama_al_modelo()
    {
        var (_, orderId, _) = await OrderAsync("invscan6a");
        var (intruder, _, _) = await OrderAsync("invscan6b");
        factory.Ai.Respond(AiSetup.Sonnet, AiSetup.Reply(Invoice(5_000m)));

        var response = await ScanAsync(intruder, orderId);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(factory.Ai.Calls(AiSetup.Sonnet));
        Assert.Empty(await UsageAsync(intruder.TenantId));
    }
}
