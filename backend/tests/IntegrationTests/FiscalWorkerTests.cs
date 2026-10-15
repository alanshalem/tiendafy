using System.Net;
using System.Text.Json;
using Api.Fiscal;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La factura automática cuando algo sale mal: un rechazo de ARCA no se
/// reintenta (y queda el motivo, venga en errores u observaciones), una caída
/// de ARCA se reintenta más tarde con espera creciente, y después del último
/// intento el job queda fallido con el error a la vista.
/// </summary>
[Collection("api")]
public sealed class FiscalWorkerTests(ApiFactory factory)
{
    private async Task<Merchant> AutoInvoicingStoreAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var pos = (await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items")[0].GetProperty("id").GetGuid();
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "PAYMENT",
            defaultPointOfSaleId = pos,
            consumerFinalThresholdMinorUnits = 0L,
        });
        return merchant;
    }

    private async Task<FiscalEmissionJob> JobAsync(Guid orderId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        return await db.EmissionJobs.AsNoTracking().SingleAsync(j => j.OrderId == orderId && j.Kind == FiscalJobKind.Invoice);
    }

    /// <summary>Deja el job listo para la próxima pasada, con esos intentos ya hechos.</summary>
    private async Task MakeDueAsync(Guid jobId, int attempts)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE fiscal_emission_jobs SET attempts = {attempts}, next_attempt_utc = {DateTime.UtcNow.AddMinutes(-1)} WHERE id = {jobId}");
    }

    /// <summary>El job queda como lo deja un proceso que murió con él tomado.</summary>
    private async Task LeaveProcessingAsync(Guid jobId, TimeSpan since)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE fiscal_emission_jobs SET status = 'Processing', updated_at_utc = {DateTime.UtcNow - since} WHERE id = {jobId}");
    }

    [Fact]
    public async Task Un_job_abandonado_vuelve_por_la_reconciliacion_y_no_se_factura_dos_veces()
    {
        var merchant = await AutoInvoicingStoreAsync("fwl");
        var arca = new FakeArca(factory.ExternalHttp) { LoseNextResponse = true };
        var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00);

        // ARCA autoriza el 1 y la respuesta se pierde: queda el comprobante
        // pendiente (write-ahead). Después el proceso muere con el job tomado.
        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
        var job = await JobAsync(order);
        await LeaveProcessingAsync(job.Id, FiscalEmissionWorker.ProcessingLease + TimeSpan.FromMinutes(1));

        // Pasado el lease vuelve a la cola, y el reintento le pregunta a ARCA
        // por el pendiente antes de pedir otro número: lo adopta.
        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);

        var done = await JobAsync(order);
        Assert.Equal(FiscalJobStatus.Done, done.Status);
        Assert.Equal(1, arca.CaeRequests);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var doc = await db.Documents.AsNoTracking().SingleAsync(d => d.OrderId == order);
        Assert.Equal(FiscalResult.Authorized, doc.Result);
        Assert.Equal(1, doc.Number);
        Assert.Equal(done.FiscalDocumentId, doc.Id);
    }

    [Fact]
    public async Task Un_job_tomado_hace_poco_no_se_toca()
    {
        var merchant = await AutoInvoicingStoreAsync("fwp");
        var arca = new FakeArca(factory.ExternalHttp);
        var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00);
        var job = await JobAsync(order);

        // Otro intento lo está procesando: dentro del lease no se retoma.
        await LeaveProcessingAsync(job.Id, TimeSpan.FromMinutes(1));
        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);

        Assert.Equal(FiscalJobStatus.Processing, (await JobAsync(order)).Status);
        Assert.Equal(0, arca.CaeRequests);
    }

    // ------------------------------------------------- email "factura"

    private static async Task EnableInvoiceEmailAsync(Merchant merchant) =>
        await merchant.PutAsync("/api/v1/email-templates/factura", new
        {
            enabled = true,
            subject = "Tu factura de {{store}}",
            bodyHtml = "<p>Adjuntamos la factura de tu compra #{{order_id}}.</p>",
        });

    /// <summary>Los emails "factura" que salieron a esa dirección, con sus adjuntos.</summary>
    private List<JsonElement> InvoiceEmailsTo(string address) =>
        [.. factory.ExternalHttp.SentTo(ApiFactory.ResendEmails)
            .Select(r => JsonDocument.Parse(r.Body!).RootElement)
            .Where(e => e.GetProperty("to")[0].GetString() == address
                        && e.GetProperty("subject").GetString()!.StartsWith("Tu factura", StringComparison.Ordinal))];

    [Fact]
    public async Task Con_el_CAE_el_comprador_recibe_su_factura_en_PDF_una_sola_vez()
    {
        var merchant = await AutoInvoicingStoreAsync("fwe");
        await EnableInvoiceEmailAsync(merchant);
        var buyer = $"factura-{Guid.NewGuid():N}@test.local";
        var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00, buyerEmail: buyer);

        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
        Assert.Equal(FiscalJobStatus.Done, (await JobAsync(order)).Status);

        var email = Assert.Single(InvoiceEmailsTo(buyer));
        var attachment = Assert.Single(email.GetProperty("attachments").EnumerateArray());
        Assert.Matches(@"^comprobante-0003-\d{8}\.pdf$", attachment.GetProperty("filename").GetString());
        var pdf = Convert.FromBase64String(attachment.GetProperty("content").GetString()!);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(pdf, 0, 4));

        // El botón "Facturar" sobre la misma venta: ya está facturada, y el
        // comprador no recibe otro email.
        var again = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{order}/invoice");
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Single(InvoiceEmailsTo(buyer));
    }

    [Fact]
    public async Task La_factura_manual_tambien_se_manda_por_email()
    {
        var merchant = await Merchant.CreateAsync(factory, "fwm");
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        await EnableInvoiceEmailAsync(merchant);
        var buyer = $"manual-{Guid.NewGuid():N}@test.local";
        var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00, buyerEmail: buyer);

        await merchant.PostAsync($"/api/v1/orders/{order}/invoice", new { });

        var email = Assert.Single(InvoiceEmailsTo(buyer));
        Assert.Contains("Adjuntamos la factura", email.GetProperty("html").GetString());
    }

    [Fact]
    public async Task Sin_la_plantilla_prendida_o_sin_email_no_sale_nada()
    {
        // La plantilla viene apagada: una tienda que nunca la prendió no manda.
        var apagada = await AutoInvoicingStoreAsync("fwo");
        var buyer = $"apagada-{Guid.NewGuid():N}@test.local";
        var order = await apagada.CreateSaleAsync(priceMinor: 20_000_00, buyerEmail: buyer);
        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
        Assert.Equal(FiscalJobStatus.Done, (await JobAsync(order)).Status);
        Assert.Empty(InvoiceEmailsTo(buyer));

        // Prendida, pero la venta de mostrador no tiene email (relleno).
        var prendida = await AutoInvoicingStoreAsync("fws");
        await EnableInvoiceEmailAsync(prendida);
        var placeholder = $"mostrador-{Guid.NewGuid():N}@sin-email.local";
        var counter = await prendida.CreateSaleAsync(priceMinor: 20_000_00, buyerEmail: placeholder);
        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
        Assert.Equal(FiscalJobStatus.Done, (await JobAsync(counter)).Status);
        Assert.Empty(InvoiceEmailsTo(placeholder));
    }

    [Fact]
    public async Task Un_rechazo_de_ARCA_no_se_reintenta_y_deja_el_motivo()
    {
        var merchant = await AutoInvoicingStoreAsync("fwr");
        var arca = new FakeArca(factory.ExternalHttp) { RejectNext = true };
        var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00);

        await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
        var job = await JobAsync(order);
        Assert.Equal(FiscalJobStatus.Failed, job.Status);
        Assert.Contains("10015", job.LastError, StringComparison.Ordinal);
        Assert.False(arca.RejectNext);
    }

    [Fact]
    public async Task Con_ARCA_caido_se_reintenta_mas_tarde_y_al_final_se_rinde()
    {
        var merchant = await AutoInvoicingStoreAsync("fwd");
        // WSFE no responde SOAP: el emisor falla y el job se reprograma.
        factory.ExternalHttp.On(HttpMethod.Post, FakeArca.Wsfe,
            (_, _) => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) { Content = new StringContent("caído") });
        try
        {
            var order = await merchant.CreateSaleAsync(priceMinor: 20_000_00);
            await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
            var retry = await JobAsync(order);
            Assert.Equal(FiscalJobStatus.Pending, retry.Status);
            Assert.Equal(1, retry.Attempts);
            Assert.NotNull(retry.LastError);
            Assert.True(retry.NextAttemptUtc > DateTime.UtcNow, "el reintento es más tarde, no ya");

            // El último intento también falla: queda fallido con el último error.
            await MakeDueAsync(retry.Id, attempts: 7);
            await Workers.RunOnceAsync<FiscalEmissionWorker>(factory);
            var failed = await JobAsync(order);
            Assert.Equal(FiscalJobStatus.Failed, failed.Status);
            Assert.StartsWith("Agotó 8 reintentos", failed.LastError, StringComparison.Ordinal);
        }
        finally
        {
            _ = new FakeArca(factory.ExternalHttp); // ARCA vuelve para los demás tests
        }
    }
}
