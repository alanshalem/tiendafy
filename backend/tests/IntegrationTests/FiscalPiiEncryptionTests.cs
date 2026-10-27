using System.Text;
using Api.Startup;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace IntegrationTests;

/// <summary>
/// El documento del comprador también va cifrado en Fiscal: el número del
/// receptor de cada comprobante, el SOAP crudo que se guarda para auditoría y
/// el job de emisión. Antes, aunque la venta lo tuviera cifrado, un volcado de
/// la base lo entregaba igual por acá. Lo que se mira es la base con SQL crudo y
/// que la factura, el PDF, el libro IVA y la reconciliación sigan recibiendo el
/// número de verdad.
/// </summary>
[Collection("api")]
public sealed class FiscalPiiEncryptionTests(ApiFactory factory)
{
    private const string Doc = "30111222";

    [Fact]
    public async Task El_comprobante_y_el_job_guardan_cifrado_el_documento_y_todo_lo_demas_lo_lee_bien()
    {
        var merchant = await Merchant.CreateAsync(factory, "fpii");
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var orderId = await ManualSaleAsync(merchant);

        var invoice = await merchant.PostAsync($"/api/v1/orders/{orderId}/invoice", new { });
        Assert.True(invoice.GetProperty("authorized").GetBoolean(), invoice.ToString());
        var documentId = invoice.GetProperty("documentId").GetGuid();
        // A ARCA le llega el número de verdad.
        Assert.Contains(factory.ExternalHttp.SentTo(FakeArca.Wsfe), r => r.Body!.Contains($">{Doc}<", StringComparison.Ordinal));

        // En la base: ciphertext de DataProtection, no el dato.
        foreach (var column in new[] { "doc_nro", "request_payload", "response_payload" })
        {
            var stored = await ColumnAsync("fiscal_documents", column, documentId);
            Assert.StartsWith(PiiColumns.ProtectedPrefix, stored, StringComparison.Ordinal);
            Assert.DoesNotContain(Doc, stored, StringComparison.Ordinal);
        }

        // Por EF, descifrado.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var fiscal = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            var document = await fiscal.Documents.IgnoreQueryFilters().AsNoTracking().SingleAsync(d => d.Id == documentId);
            Assert.Equal(long.Parse(Doc), document.DocNro);
            Assert.Contains(Doc, document.RequestPayload, StringComparison.Ordinal);
            Assert.Equal(DocTipo.Dni, document.IssuedReceptor().DocTipo);
            Assert.Equal(long.Parse(Doc), document.IssuedReceptor().DocNro); // de acá sale el receptor de la NC
        }

        // El PDF y el libro IVA.
        await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/invoice.pdf");
        Assert.Contains(Doc, await VatBookAsync(merchant), StringComparison.Ordinal);

        // El job de emisión (la factura automática y las notas de crédito).
        var jobId = await AddJobAsync(merchant.TenantId, orderId, Doc);
        var storedJob = await ColumnAsync("fiscal_emission_jobs", "buyer_doc", jobId);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, storedJob, StringComparison.Ordinal);
        Assert.Equal(Doc, await JobBuyerDocAsync(jobId));
    }

    [Fact]
    public async Task Los_comprobantes_viejos_en_claro_se_leen_y_los_cifra_el_arranque_de_la_version_nueva()
    {
        var merchant = await Merchant.CreateAsync(factory, "fpiil");
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var orderId = await ManualSaleAsync(merchant);
        var documentId = (await merchant.PostAsync($"/api/v1/orders/{orderId}/invoice", new { })).GetProperty("documentId").GetGuid();
        var jobId = await AddJobAsync(merchant.TenantId, orderId, Doc);

        // Como quedaron los de antes del cifrado: en claro (la migración pasa el
        // número a texto tal cual).
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE fiscal_documents SET doc_nro = '27999888', request_payload = '<DocNro>27999888</DocNro>', response_payload = NULL WHERE id = {documentId}");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE fiscal_emission_jobs SET buyer_doc = '27999888' WHERE id = {jobId}");
        }

        await AssertOldValuesAsync(merchant, documentId, jobId);

        // Las cifra el arranque de la versión nueva (BuyerPiiBackfillService), no `migrate`.
        await factory.Services.MigrateDatabaseAsync();
        Assert.Equal("27999888", await ColumnAsync("fiscal_documents", "doc_nro", documentId));
        await BuyerPiiBackfill.RunAsync(factory.Services, NullLogger.Instance);

        Assert.StartsWith(PiiColumns.ProtectedPrefix, await ColumnAsync("fiscal_documents", "doc_nro", documentId), StringComparison.Ordinal);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await ColumnAsync("fiscal_documents", "request_payload", documentId), StringComparison.Ordinal);
        Assert.Null(await ColumnAsync("fiscal_documents", "response_payload", documentId));
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await ColumnAsync("fiscal_emission_jobs", "buyer_doc", jobId), StringComparison.Ordinal);

        await AssertOldValuesAsync(merchant, documentId, jobId);

        // Una segunda pasada no vuelve a cifrar lo cifrado.
        var before = await ColumnAsync("fiscal_documents", "doc_nro", documentId);
        await BuyerPiiBackfill.RunAsync(factory.Services, NullLogger.Instance);
        Assert.Equal(before, await ColumnAsync("fiscal_documents", "doc_nro", documentId));
    }

    private async Task AssertOldValuesAsync(Merchant merchant, Guid documentId, Guid jobId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var document = await scope.ServiceProvider.GetRequiredService<FiscalDbContext>().Documents
            .IgnoreQueryFilters().AsNoTracking().SingleAsync(d => d.Id == documentId);
        Assert.Equal(27_999_888L, document.DocNro);
        Assert.Equal("<DocNro>27999888</DocNro>", document.RequestPayload);
        Assert.Equal("27999888", await JobBuyerDocAsync(jobId));
        Assert.Contains("27999888", await VatBookAsync(merchant), StringComparison.Ordinal);
    }

    private static async Task<string> VatBookAsync(Merchant merchant)
    {
        var now = ArgentinaTime.ToLocal(DateTime.UtcNow);
        var res = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/fiscal/documents/export?year={now.Year}&month={now.Month}");
        var csv = Encoding.UTF8.GetString(await res.Content.ReadAsByteArrayAsync());
        Assert.DoesNotContain(PiiColumns.ProtectedPrefix, csv, StringComparison.Ordinal);
        return csv;
    }

    private async Task<Guid> AddJobAsync(Guid tenantId, Guid orderId, string buyerDoc)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        // Para dentro de un año: el worker no lo toma en el medio del test.
        var job = FiscalEmissionJob.Create(tenantId, orderId, FiscalJobKind.CreditNote, 100,
            buyerDoc, idempotencyKey: $"pii-{Guid.NewGuid():N}", notBefore: DateTime.UtcNow.AddYears(1));
        db.EmissionJobs.Add(job);
        await db.SaveChangesAsync();
        return job.Id;
    }

    private async Task<string?> JobBuyerDocAsync(Guid jobId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<FiscalDbContext>().EmissionJobs
            .IgnoreQueryFilters().AsNoTracking().Where(j => j.Id == jobId).Select(j => j.BuyerDoc).SingleAsync();
    }

    private static async Task<Guid> ManualSaleAsync(Merchant merchant)
    {
        var (_, variantId) = await merchant.CreateProductAsync($"Producto {Guid.NewGuid():N}"[..20], priceMinor: 10_000_00, stock: 5);
        var sale = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = "fiscal-pii@test.local",
            buyerName = "Ana Pérez",
            docNumber = Doc,
        });
        return sale.GetProperty("id").GetGuid();
    }

    /// <summary>Lo que hay de verdad en la columna, sin pasar por el converter de EF.</summary>
    private async Task<string?> ColumnAsync(string table, string column, Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        // Tabla y columna son constantes de este archivo; el id va como parámetro.
        var sql = "SELECT " + column + " AS \"Value\" FROM " + table + " WHERE id = {0}";
        var rows = await db.Database.SqlQueryRaw<string?>(sql, id).ToListAsync();
        return Assert.Single(rows);
    }
}
