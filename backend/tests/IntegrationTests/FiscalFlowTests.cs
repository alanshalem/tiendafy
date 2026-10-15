using System.Net;
using System.Text;
using System.Text.Json;
using Api.Fiscal;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Facturación electrónica con ARCA de punta a punta, por el camino de
/// producción: datos del emisor → CSR → certificado → login en WSAA (firma
/// CMS de verdad) → CAE en WSFEv1 → PDF con QR → nota de crédito → libro IVA.
///
/// <para>
/// ARCA está simulado en <see cref="FakeHttp"/> a nivel SOAP: recibe el XML que
/// arma la API y contesta XML con la forma del real. El certificado lo emite
/// el propio test para el CSR que generó la API (una CA de prueba hace de
/// ARCA), así que la clave privada, el cifrado y la firma del TRA son los de
/// producción.
/// </para>
/// </summary>
[Collection("api")]
public sealed class FiscalFlowTests
{
    private const string Cuit = FakeArca.Cuit;
    private const string Wsaa = FakeArca.Wsaa;

    private readonly ApiFactory _factory;

    public FiscalFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Configurar_certificar_facturar_y_anular()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fis");
        var arca = new FakeArca(_factory.ExternalHttp);

        // Sin emisor no hay nada que hacer.
        Assert.False((await merchant.GetAsync("/api/v1/fiscal/config")).GetProperty("configured").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config/emission", new { autoInvoice = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/csr", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/test-connection")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);

        // 1. Emisor: el CUIT se valida con su dígito verificador.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config",
            new { cuit = "20111111113", businessName = "Tienda", condition = "RESPONSABLE_INSCRIPTO" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config",
            new { cuit = Cuit, businessName = "" })).StatusCode);
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda, S.A.", condition = "RESPONSABLE_INSCRIPTO", environment = "HOMOLOGACION" });
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda SA", condition = "RESPONSABLE_INSCRIPTO", environment = "HOMOLOGACION" });

        // 2. Certificado: CSR → ARCA lo firma → se activa.
        var csr = await merchant.PostAsync("/api/v1/fiscal/certificate/csr", new { alias = "tiendafy-test" });
        var certificateId = csr.GetProperty("certificateId").GetGuid();
        var csrPem = csr.GetProperty("csrPem").GetString()!;
        Assert.StartsWith("-----BEGIN CERTIFICATE REQUEST-----", csrPem);

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = "no es un certificado" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = TestCa.SignUnrelated() })).StatusCode); // de otra clave
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId = Guid.NewGuid(), certificatePem = TestCa.Sign(csrPem) })).StatusCode);

        var activated = await merchant.PostAsync("/api/v1/fiscal/certificate/activate", new { certificateId, certificatePem = TestCa.Sign(csrPem) });
        Assert.True(activated.GetProperty("usable").GetBoolean());
        var config = await merchant.GetAsync("/api/v1/fiscal/config");
        Assert.Equal("ACTIVE", config.GetProperty("certificate").GetProperty("status").GetString());
        Assert.DoesNotContain("PRIVATE KEY", config.ToString());

        // 3. Punto de venta y diagnóstico.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/points-of-sale", new { number = 0 })).StatusCode);
        var pos = await merchant.PostAsync("/api/v1/fiscal/points-of-sale", new { number = 3, label = "Web" });
        Assert.Single((await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items").EnumerateArray());

        var health = await merchant.PostAsync("/api/v1/fiscal/health", new { });
        Assert.True(health.GetProperty("ok").GetBoolean());

        var diagnosis = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.True(diagnosis.GetProperty("ok").GetBoolean(), diagnosis.ToString());
        Assert.Equal(4, diagnosis.GetProperty("steps").GetArrayLength());
        // El TRA viajó firmado en CMS (base64) dentro del SOAP de WSAA.
        Assert.Contains("<wsaa:in0>MI", _factory.ExternalHttp.SentTo(Wsaa).Last().Body);

        // 4. Padrón: quién es un CUIT y su condición de IVA.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/fiscal/padron/20111111113")).StatusCode);
        var persona = await merchant.GetAsync($"/api/v1/fiscal/padron/{Cuit}");
        Assert.Equal("PUENTE ORIENTE SA", persona.GetProperty("name").GetString());
        Assert.Equal("ResponsableInscripto", persona.GetProperty("condicion").GetString());

        // 5. Comprobante suelto desde el panel.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/emit", new { amount = 0m })).StatusCode);
        var loose = await merchant.PostAsync("/api/v1/fiscal/emit", new { amount = 1210m, ptoVta = 3, creditNote = false });
        Assert.True(loose.GetProperty("authorized").GetBoolean());
        Assert.Equal(1, loose.GetProperty("number").GetInt64());

        // 6. Facturar una venta: a mano, con su PDF.
        var orderId = await merchant.CreateSaleAsync(priceMinor: 121_000_00);
        var bad = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/invoice")
        {
            Content = new StringContent("{no es json", Encoding.UTF8, "application/json"),
        };
        bad.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.Client.SendAsync(bad)).StatusCode);

        var invoice = await merchant.PostAsync($"/api/v1/orders/{orderId}/invoice", new { buyerDoc = "30111222", buyerIvaCondition = "ConsumidorFinal" });
        Assert.True(invoice.GetProperty("authorized").GetBoolean(), invoice.ToString());
        Assert.Matches("^7\\d{13}$", invoice.GetProperty("cae").GetString()!);

        // Dos veces no: la venta ya tiene factura.
        Assert.False((await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/invoice")).IsSuccessStatusCode);

        var pdf = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/invoice.pdf");
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("%PDF", Encoding.ASCII.GetString((await pdf.Content.ReadAsByteArrayAsync())[..4]));
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/invoice.pdf?type=creditnote")).StatusCode);

        // 7. Factura automática al cobrar, por el worker.
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "PAYMENT",
            defaultPointOfSaleId = pos.GetProperty("id").GetGuid(),
            consumerFinalThresholdMinorUnits = 0L,
        });
        var autoOrder = await merchant.CreateSaleAsync(priceMinor: 50_000_00);
        await RunEmissionUntilAsync(autoOrder, "Done");
        var fiscal = await merchant.GetAsync($"/api/v1/orders/{autoOrder}/fiscal");
        Assert.Single(fiscal.GetProperty("documents").EnumerateArray());

        // 8. Devolver la venta encola la nota de crédito, y el worker la emite.
        await merchant.PostAsync($"/api/v1/orders/{autoOrder}/refund", new { reason = "Devolución" });
        await RunEmissionUntilAsync(autoOrder, "Done", kind: "CreditNote");
        var nc = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{autoOrder}/invoice.pdf?type=creditnote");
        Assert.Equal("application/pdf", nc.Content.Headers.ContentType?.MediaType);

        // Reencolar un job a mano (lo que hace el botón "Reintentar").
        var jobId = (await merchant.GetAsync($"/api/v1/orders/{autoOrder}/fiscal")).GetProperty("jobs")[0].GetProperty("id").GetGuid();
        await merchant.PostAsync($"/api/v1/fiscal/jobs/{jobId}/retry", new { });
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/fiscal/jobs/{Guid.NewGuid()}/retry")).StatusCode);
        await RunEmissionUntilAsync(autoOrder, "Done"); // ya facturada: se da por hecha, no se duplica

        // 9. Libro IVA del mes, en CSV para el contador.
        var now = SharedKernel.Common.ArgentinaTime.Today;
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/fiscal/documents/export?year=2019&month=1")).StatusCode);
        var csv = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/fiscal/documents/export?year={now.Year}&month={now.Month}");
        var book = await csv.Content.ReadAsStringAsync();
        Assert.Contains("Fecha;Tipo;Punto de venta", book);
        Assert.True(book.Split('\n').Length >= 5, book); // encabezado + 4 comprobantes

        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/fiscal/points-of-sale/{pos.GetProperty("id").GetGuid()}");
    }

    [Fact]
    public async Task Los_rechazos_de_ARCA_llegan_explicados()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fir");
        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda SA", condition = "MONOTRIBUTO" });

        // Sin certificado: el diagnóstico frena en el primer paso.
        var noCert = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.False(noCert.GetProperty("ok").GetBoolean());
        Assert.Single(noCert.GetProperty("steps").EnumerateArray());

        var csr = await merchant.PostAsync("/api/v1/fiscal/certificate/csr", new { });
        await merchant.PostAsync("/api/v1/fiscal/certificate/activate",
            new { certificateId = csr.GetProperty("certificateId").GetGuid(), certificatePem = TestCa.Sign(csr.GetProperty("csrPem").GetString()!) });

        // WSAA rechaza el certificado: el diagnóstico frena en la autenticación.
        arca.WsaaFault = "coe.notAuthorized";
        var wsaa = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.Equal("error", wsaa.GetProperty("steps")[1].GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);
        arca.WsaaFault = null;

        // ARCA rechaza el comprobante: el motivo vuelve explicado.
        arca.RejectNext = true;
        var rejected = await merchant.PostAsync("/api/v1/fiscal/emit", new { amount = 500m, ptoVta = 1 });
        Assert.False(rejected.GetProperty("authorized").GetBoolean());
        Assert.NotEmpty(rejected.GetProperty("errors").EnumerateArray());

        // WSFE no acepta al CUIT (el famoso 600).
        arca.LastAuthorizedError = ("600", "ValidacionDeToken: No aparecio CUIT en lista de relaciones");
        var wsfe = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.Contains(wsfe.GetProperty("steps").EnumerateArray(), s => s.GetProperty("key").GetString() == "wsfe" && s.GetProperty("status").GetString() == "error");
        arca.LastAuthorizedError = null;

        // Un CUIT que el padrón no conoce vuelve como Fault.
        arca.PadronFault = "No existe persona con ese Id";
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);

        // ARCA caído: el health lo dice.
        arca.Down = true;
        var down = await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/health");
        Assert.False(down.IsSuccessStatusCode && (await down.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task El_libro_IVA_corta_el_mes_en_hora_argentina_y_no_mezcla_ambientes()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fib");
        await merchant.PutAsync("/api/v1/fiscal/config", new
        {
            cuit = Cuit,
            businessName = "Tienda SA",
            condition = "RESPONSABLE_INSCRIPTO",
            environment = "HOMOLOGACION",
        });

        // 31/08 a las 23:30 en Argentina es 01/09 02:30 en UTC: es de agosto.
        // Antes caía en septiembre. Y uno de producción no entra en el libro
        // de una tienda que factura en homologación (ni al revés).
        await SeedDocumentAsync(merchant.TenantId, 101, new DateTime(2026, 9, 1, 2, 30, 0, DateTimeKind.Utc));
        await SeedDocumentAsync(merchant.TenantId, 102, new DateTime(2026, 9, 1, 3, 30, 0, DateTimeKind.Utc));
        await SeedDocumentAsync(merchant.TenantId, 103, new DateTime(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc),
            global::Fiscal.Core.Domain.FiscalEnvironment.Produccion);

        var agosto = await BookAsync(merchant, 2026, 8);
        var septiembre = await BookAsync(merchant, 2026, 9);

        var a = Assert.Single(agosto);
        Assert.Contains("00000101", a);
        Assert.StartsWith("31/08/2026;", a);
        var s = Assert.Single(septiembre);
        Assert.Contains("00000102", s);
        Assert.StartsWith("01/09/2026;", s);
        Assert.EndsWith(";Homologación (prueba, sin validez fiscal)", s);
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>Las filas del libro (sin el encabezado).</summary>
    private static async Task<List<string>> BookAsync(Merchant merchant, int year, int month)
    {
        var res = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/fiscal/documents/export?year={year}&month={month}");
        var text = (await res.Content.ReadAsStringAsync()).TrimStart('\uFEFF');
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(l => l.TrimEnd('\r')).ToList();
        Assert.Equal("Fecha;Tipo;Punto de venta;Numero;Doc receptor;Neto;IVA;Total;CAE;Ambiente", lines[0]);
        return lines.Skip(1).ToList();
    }

    private async Task SeedDocumentAsync(
        Guid tenantId, long number, DateTime createdAtUtc,
        global::Fiscal.Core.Domain.FiscalEnvironment env = global::Fiscal.Core.Domain.FiscalEnvironment.Homologacion)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var doc = global::Fiscal.Core.Domain.FiscalDocument.Draft(tenantId, Guid.NewGuid(), env, 1,
            global::Fiscal.Core.Domain.CbteTipo.FacturaB, number, global::Fiscal.Core.Domain.DocTipo.ConsumidorFinal, 0,
            121m, 100m, 21m, global::Fiscal.Core.Domain.CondicionIvaReceptor.ConsumidorFinal);
        doc.MarkAuthorized($"7500000000{number:D4}", createdAtUtc.AddDays(10), null, null, null);
        db.Documents.Add(doc);
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE fiscal_documents SET created_at_utc = {createdAtUtc} WHERE id = {doc.Id}");
    }

    private async Task RunEmissionUntilAsync(Guid orderId, string status, string kind = "Invoice")
    {
        var seen = "";
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            var jobs = await db.EmissionJobs.AsNoTracking().Where(j => j.OrderId == orderId).ToListAsync();
            if (jobs.Any(j => j.Kind.ToString() == kind && j.Status.ToString() == status)) return;
            seen = string.Join("; ", jobs.Select(j => $"{j.Kind} {j.Status} ({j.LastError})"));
        }
        Assert.Fail($"El job {kind} de la orden {orderId} no llegó a {status}. Jobs: [{seen}]");
    }
}
