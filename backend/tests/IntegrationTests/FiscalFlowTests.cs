using System.Net;
using System.Text;
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

        var diagnosis = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.True(diagnosis.GetProperty("ok").GetBoolean(), diagnosis.ToString());
        Assert.Equal(5, diagnosis.GetProperty("steps").GetArrayLength());
        Assert.Equal("ok", diagnosis.GetProperty("steps")[4].GetProperty("status").GetString());
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

        arca.PadronFault = null;

        // ARCA caído: el diagnóstico lo dice (la conexión no queda en verde).
        arca.Down = true;
        var down = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.False(down.GetProperty("ok").GetBoolean(), down.ToString());
        Assert.Contains(down.GetProperty("steps").EnumerateArray(),
            s => s.GetProperty("key").GetString() == "wsfe" && s.GetProperty("status").GetString() == "error");
        arca.Down = false;
    }

    [Fact]
    public async Task El_padron_pide_acceso_a_la_constancia_de_inscripcion_y_si_no_al_servicio_viejo()
    {
        const string constancia = "ws_sr_constancia_inscripcion";
        const string viejo = "ws_sr_padron_a5";
        var arca = new FakeArca(_factory.ExternalHttp);

        // El servicio vigente: el ticket se pide para la constancia y nada más.
        var merchant = await Merchant.CreateAsync(_factory, "fpc");
        await merchant.ConfigureFiscalAsync();
        Assert.Equal("PUENTE ORIENTE SA", (await merchant.GetAsync($"/api/v1/fiscal/padron/{Cuit}")).GetProperty("name").GetString());
        Assert.Contains(constancia, arca.WsaaServices);
        Assert.DoesNotContain(viejo, arca.WsaaServices);
        Assert.Contains(_factory.ExternalHttp.SentTo(FakeArca.Padron), r => r.Body!.Contains("<a5:getPersona_v2>"));

        // Una tienda cuyo certificado solo se asoció al nombre viejo sigue
        // andando, y el diagnóstico le avisa que asocie el nuevo (sin dejar la
        // conexión en rojo: el padrón es opcional).
        arca.WsaaUnauthorizedServices.Add(constancia);
        var legacy = await Merchant.CreateAsync(_factory, "fpv");
        await legacy.ConfigureFiscalAsync();
        Assert.Equal("PUENTE ORIENTE SA", (await legacy.GetAsync($"/api/v1/fiscal/padron/{Cuit}")).GetProperty("name").GetString());
        Assert.Contains(viejo, arca.WsaaServices);
        var diagnosis = await legacy.PostAsync("/api/v1/fiscal/test-connection", new { });
        var step = diagnosis.GetProperty("steps").EnumerateArray().Single(s => s.GetProperty("key").GetString() == "padron");
        Assert.Equal("warning", step.GetProperty("status").GetString());
        Assert.Contains(viejo, step.GetProperty("detail").GetString());
        Assert.Contains(constancia, step.GetProperty("detail").GetString());
        Assert.True(diagnosis.GetProperty("ok").GetBoolean(), diagnosis.ToString());

        // Sin ninguno de los dos: el mensaje dice qué servicio asociar.
        arca.WsaaUnauthorizedServices.Add(viejo);
        var none = await Merchant.CreateAsync(_factory, "fpn");
        await none.ConfigureFiscalAsync();
        var denied = await none.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}");
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode);
        Assert.Contains(constancia, await denied.Content.ReadAsStringAsync());
        Assert.True((await none.PostAsync("/api/v1/fiscal/test-connection", new { })).GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task Lo_facturado_en_homologacion_no_cuenta_en_produccion()
    {
        // Una venta facturada de prueba se tiene que poder facturar de verdad
        // después de pasar a producción: antes el "ya facturada" no miraba el
        // ambiente y la venta quedaba sin factura válida para siempre.
        var merchant = await Merchant.CreateAsync(_factory, "fie");
        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var posId = (await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items")[0].GetProperty("id").GetGuid();

        // Una facturada a mano y otra por la automática, las dos en homologación.
        var manual = await merchant.CreateSaleAsync(priceMinor: 10_000_00);
        Assert.True((await merchant.PostAsync($"/api/v1/orders/{manual}/invoice", new { })).GetProperty("authorized").GetBoolean());
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "PAYMENT",
            defaultPointOfSaleId = posId,
            consumerFinalThresholdMinorUnits = 0L,
        });
        var automatic = await merchant.CreateSaleAsync(priceMinor: 20_000_00);
        await RunEmissionUntilAsync(automatic, "Done");

        // Dentro del mismo ambiente, la idempotencia sigue igual.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{manual}/invoice")).StatusCode);

        // Pasa a producción, con su certificado. La venta muestra la factura
        // de prueba como tal, no ofrece su PDF y se puede facturar de nuevo.
        await merchant.SwitchFiscalEnvironmentAsync("PRODUCCION");
        // El mismo valor que manda el panel (y que devuelve GET /fiscal/config).
        var emission = await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "ONFULFILLMENT",
            defaultPointOfSaleId = posId,
            consumerFinalThresholdMinorUnits = 0L,
        });
        Assert.Equal("ONFULFILLMENT", emission.GetProperty("trigger").GetString());
        var status = await merchant.GetAsync($"/api/v1/orders/{manual}/fiscal");
        Assert.Equal("PRODUCCION", status.GetProperty("environment").GetString());
        Assert.Equal("HOMOLOGACION", Assert.Single(status.GetProperty("documents").EnumerateArray()).GetProperty("environment").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/orders/{manual}/invoice.pdf")).StatusCode);

        var real = await merchant.PostAsync($"/api/v1/orders/{manual}/invoice", new { });
        Assert.True(real.GetProperty("authorized").GetBoolean(), real.ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{manual}/invoice")).StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{manual}/invoice.pdf");
        Assert.Contains(_factory.ExternalHttp.SentTo(FakeArca.WsfeProduccion), r => r.Body!.Contains("FECAESolicitar"));

        // La automática: el job que terminó en homologación vuelve a empezar
        // cuando llega el disparador, y el worker factura en producción.
        await merchant.PostAsync($"/api/v1/orders/{automatic}/fulfill", new { tracking = (string?)null });
        await RunEmissionUntilAsync(automatic, "Done");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var docs = await db.Documents.IgnoreQueryFilters().AsNoTracking().Where(d => d.OrderId == automatic && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized).ToListAsync();
        Assert.Equal(
            [global::Fiscal.Core.Domain.FiscalEnvironment.Homologacion, global::Fiscal.Core.Domain.FiscalEnvironment.Produccion],
            docs.Select(d => d.Environment).Order());
        var job = await db.EmissionJobs.IgnoreQueryFilters().AsNoTracking().SingleAsync(j => j.OrderId == automatic);
        Assert.Equal(docs.Single(d => d.Environment == global::Fiscal.Core.Domain.FiscalEnvironment.Produccion).Id, job.FiscalDocumentId);
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
            var jobs = await db.EmissionJobs.IgnoreQueryFilters().AsNoTracking().Where(j => j.OrderId == orderId).ToListAsync();
            if (jobs.Any(j => j.Kind.ToString() == kind && j.Status.ToString() == status)) return;
            seen = string.Join("; ", jobs.Select(j => $"{j.Kind} {j.Status} ({j.LastError})"));
        }
        Assert.Fail($"El job {kind} de la orden {orderId} no llegó a {status}. Jobs: [{seen}]");
    }
}
