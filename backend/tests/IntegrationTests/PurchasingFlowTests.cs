using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Ai.Infrastructure;
using Microsoft.Extensions.AI;

namespace IntegrationTests;

/// <summary>
/// Compras de importación de punta a punta: proveedor → orden de compra en
/// dólares con gastos → confirmar → tránsito → factura del proveedor (leída
/// por IA y confirmada a mano) → recepción con el tipo de cambio final, que
/// sube el stock y fija el costo "en depósito" → libro de IVA compras.
///
/// <para>
/// El landed cost es lo que alimenta Rentabilidad: si el prorrateo de gastos
/// o el tipo de cambio están mal, todos los márgenes del panel mienten. Por
/// eso se calcula a mano en el test y se compara.
/// </para>
/// </summary>
[Collection("api")]
public sealed class PurchasingFlowTests
{
    private readonly ApiFactory _factory;

    public PurchasingFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Orden_de_compra_de_importacion_de_punta_a_punta()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pur");
        var (remeraProduct, remera) = await merchant.CreateProductAsync("Remera importada", priceMinor: 20_000_00, stock: 0);
        var (_, gorra) = await merchant.CreateProductAsync("Gorra importada", priceMinor: 9_000_00, stock: 0);

        // Proveedor.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/suppliers", new { name = "" })).StatusCode);
        var supplier = await merchant.PostAsync("/api/v1/suppliers", new { name = "Shenzhen Trading", taxId = "30712345678", country = "CN", email = "sales@sz.test" });
        var supplierId = supplier.GetProperty("id").GetGuid();
        await merchant.PatchAsync($"/api/v1/suppliers/{supplierId}", new { name = "Shenzhen Trading Co.", taxId = "30712345678", phone = "+86 755", active = true });

        // Orden en USD: 100 remeras a 4 USD y 50 gorras a 2 USD, con flete
        // internacional (USD) y despachante (pesos).
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "X",
            currency = "USD",
            exchangeRate = 1000m,
            items = new[] { new { variantId = Guid.NewGuid(), quantity = 1, unitCost = 1m } },
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "X",
            currency = "DOLARES",
            exchangeRate = 1000m,
        })).StatusCode);

        var po = await merchant.PostAsync("/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "Shenzhen Trading Co.",
            supplierId,
            reference = "PO-TEST-1",
            currency = "USD",
            exchangeRate = 1000m,
            leadTimeDays = 45,
            items = new[]
            {
                new { variantId = remera, quantity = 100, unitCost = 4m },
                new { variantId = gorra, quantity = 50, unitCost = 2m },
            },
            expenses = new[]
            {
                new { label = "Flete marítimo", amount = 100m, isLocal = false },
                new { label = "Despachante", amount = 50_000m, isLocal = true },
            },
        });
        var poId = po.GetProperty("id").GetGuid();

        // Editar mientras es borrador.
        await merchant.PutAsync($"/api/v1/purchasing/purchase-orders/{poId}", new
        {
            supplierName = "Shenzhen Trading Co.",
            supplierId,
            reference = "PO-TEST-1",
            notes = "Contenedor de octubre",
            currency = "USD",
            exchangeRate = 1000m,
            leadTimeDays = 45,
            items = new[]
            {
                new { variantId = remera, quantity = 100, unitCost = 4m },
                new { variantId = gorra, quantity = 50, unitCost = 2m },
            },
            expenses = new[]
            {
                new { label = "Flete marítimo", amount = 100m, isLocal = false },
                new { label = "Despachante", amount = 50_000m, isLocal = true },
            },
        });

        // Recibir sin confirmar: no.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/receive",
            new { items = new[] { new { variantId = remera, receivedQuantity = 100 } } })).StatusCode);

        // Ciclo: confirmada → en tránsito. Estados inválidos.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/status", new { status = "volando" })).StatusCode);
        await merchant.PostAsync($"/api/v1/purchasing/purchase-orders/{poId}/status", new { status = "Confirmed" });
        await merchant.PostAsync($"/api/v1/purchasing/purchase-orders/{poId}/status", new { status = "InTransit" });
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/status", new { status = "Draft" })).StatusCode);
        // Ya no se edita.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/purchasing/purchase-orders/{poId}", new { supplierName = "X", currency = "USD", exchangeRate = 1m })).StatusCode);

        // La factura del proveedor: la IA la lee y PROPONE, la persona confirma.
        await AiSetup.ConfigureAsync(merchant, (AiTask.InvoiceRead, AiSetup.Sonnet));
        _factory.Ai.Respond(AiSetup.Sonnet, AiSetup.Reply("```json\n" + JsonSerializer.Serialize(new
        {
            supplierName = "SHENZHEN TRADING CO",
            supplierTaxId = "30-71234567-1",
            invoiceType = "a",
            invoiceNumber = "0003-00001234",
            invoiceDate = "2026-10-05",
            currency = "ARS",
            netAmount = 500000.00m,
            vatAmount = 105000.00m,
            totalAmount = 605000.00m,
            lines = new[] { new { description = "Remeras", quantity = 100, unitPrice = 5000m } },
            confidence = "alta",
            warnings = new[] { "El CUIT tiene un dígito borroso" },
        }) + "\n```"));
        var scanned = await ScanAsync(merchant, poId, "application/pdf", "%PDF-1.4 factura"u8.ToArray());
        Assert.Equal(HttpStatusCode.OK, scanned.StatusCode);
        var proposal = await scanned.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("30712345671", proposal.GetProperty("supplierTaxId").GetString());
        Assert.Equal("A", proposal.GetProperty("invoiceType").GetString());
        Assert.Empty(proposal.GetProperty("checks").EnumerateArray()); // la factura cierra: una sola llamada
        Assert.False(proposal.GetProperty("currencyMismatch").GetBoolean());
        var sent = Assert.Single(_factory.Ai.Calls(AiSetup.Sonnet)).Single(m => m.Role == ChatRole.User);
        Assert.Equal("application/pdf", sent.Contents.OfType<DataContent>().Single().MediaType); // el PDF viaja como documento
        Assert.Contains("Shenzhen Trading Co.", sent.Contents.OfType<TextContent>().Single().Text); // con el contexto de la orden

        Assert.Equal(HttpStatusCode.BadRequest, (await ScanAsync(merchant, poId, "text/plain", "hola"u8.ToArray())).StatusCode);
        _factory.Ai.Respond(AiSetup.Sonnet, AiSetup.Reply("no pude leerla, perdón"));
        Assert.False((await ScanAsync(merchant, poId, "image/png", TestImages.Png)).IsSuccessStatusCode);

        // Confirmar la factura: queda la deuda en la cuenta corriente del proveedor.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/purchasing/purchase-orders/{poId}/invoice", new
        {
            supplierTaxId = "30712345678",
            invoiceType = "A",
            invoiceNumber = "0003-00001234",
            invoiceDateUtc = DateTime.UtcNow,
            invoiceNetArs = -1m,
            invoiceVatArs = 0m,
        })).StatusCode);
        await merchant.PutAsync($"/api/v1/purchasing/purchase-orders/{poId}/invoice", new
        {
            supplierTaxId = "30712345678",
            invoiceType = "A",
            invoiceNumber = "0003-00001234",
            invoiceDateUtc = DateTime.UtcNow,
            invoiceNetArs = 500_000m,
            invoiceVatArs = 105_000m,
        });
        var ficha = await merchant.GetAsync($"/api/v1/suppliers/{supplierId}");
        Assert.Equal(-605_000_00, ficha.GetProperty("balanceMinor").GetInt64());

        // Recepción con TC final 1.200: llegaron 100 remeras y 40 gorras.
        var received = await merchant.PostAsync($"/api/v1/purchasing/purchase-orders/{poId}/receive", new
        {
            items = new[]
            {
                new { variantId = remera, receivedQuantity = 100 },
                new { variantId = gorra, receivedQuantity = 40 },
            },
            exchangeRate = 1200m,
        });
        Assert.Equal(2, received.GetProperty("costsUpdated").GetInt32());
        Assert.Empty(received.GetProperty("stockErrors").EnumerateArray());
        Assert.Equal(100, await merchant.AvailableAsync(remera));
        Assert.Equal(40, await merchant.AvailableAsync(gorra));

        // Landed cost de la remera: FOB 4 USD × 1.200 = 4.800, más su parte de
        // los gastos prorrateados por valor FOB (400 de 500 USD = 80 %):
        // (flete 100 USD × 1.200 + despachante 50.000) × 0,8 / 100 u = 1.360.
        // Total: 6.160 por unidad, puesto en el depósito.
        var costs = await merchant.GetAsync($"/api/v1/products/{remeraProduct}/costs");
        Assert.Equal(6_160_00, costs.GetProperty("items")[0].GetProperty("costAmount").GetInt64());
        var detail = await merchant.GetAsync($"/api/v1/purchasing/purchase-orders/{poId}");
        Assert.Equal("RECEIVED", detail.GetProperty("status").GetString());

        // La gorra a 9.000 con costo ~2.400+gastos no está en zona de margen bajo; la remera
        // a 20.000 con costo 6.160 tampoco. Ninguna alerta.
        Assert.Empty(received.GetProperty("lowMargin").EnumerateArray());

        // Recibida no se recibe dos veces.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/receive",
            new { items = new[] { new { variantId = remera, receivedQuantity = 1 } } })).StatusCode);

        // Libro de IVA compras del mes.
        var now = DateTime.UtcNow;
        var book = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/purchasing/vat-book?year={now.Year}&month={now.Month}");
        Assert.Contains("0003-00001234", await book.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/purchasing/vat-book?year=2010&month=1")).StatusCode);

        // Resumen, sugerencias de reposición y la ficha del proveedor.
        var summary = await merchant.GetAsync("/api/v1/purchasing/summary");
        Assert.Equal(1, summary.GetProperty("received").GetInt32());
        var suggestions = await merchant.GetAsync("/api/v1/purchasing/reorder-suggestions?windowDays=30&bufferDays=10");
        Assert.True(suggestions.TryGetProperty("items", out _));
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/suppliers")).GetProperty("items").GetArrayLength());

        // Otra orden que se cancela.
        var other = await merchant.PostAsync("/api/v1/purchasing/purchase-orders", new { supplierName = "Otro", currency = "ARS", exchangeRate = 1m });
        var otherId = other.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{otherId}/status", new { status = "Confirmed" })).StatusCode); // vacía
        await merchant.PostAsync($"/api/v1/purchasing/purchase-orders/{otherId}/status", new { status = "cancelled" });
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{otherId}/status", new { status = "cancelled" })).StatusCode);

        var list = await merchant.GetAsync("/api/v1/purchasing/purchase-orders?status=Cancelled&q=Otro");
        Assert.Single(list.GetProperty("items").EnumerateArray());

        // Lo que no existe.
        var missing = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/purchasing/purchase-orders/{missing}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/purchasing/purchase-orders/{missing}", new { supplierName = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{missing}/status", new { status = "Confirmed" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{missing}/receive", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/purchasing/purchase-orders/{missing}/invoice", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ScanAsync(merchant, missing, "application/pdf", "%PDF"u8.ToArray())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/suppliers/{missing}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/suppliers/{missing}", new { name = "x" })).StatusCode);
    }

    private static async Task<HttpResponseMessage> ScanAsync(Merchant merchant, Guid poId, string contentType, byte[] bytes)
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(bytes) { Headers = { ContentType = new MediaTypeHeaderValue(contentType) } }, "file", "factura" },
        };
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/invoice/scan") { Content = form };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        return await merchant.Client.SendAsync(req);
    }
}
