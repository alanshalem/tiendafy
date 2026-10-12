using System.Net;
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
