using System.Net;
using System.Text.Json;
using Api.Fiscal;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Varias notas de crédito por venta: una por cada reembolso (total o parcial)
/// con la emisión automática, y las que se piden a mano desde la venta (por lo
/// devuelto sin acreditar o por un ajuste). La suma nunca supera la factura y
/// el mismo pedido repetido no emite dos.
/// </summary>
[Collection("api")]
public sealed class CreditNoteFlowTests
{
    private readonly ApiFactory _factory;

    public CreditNoteFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Con_emision_automatica_cada_reembolso_parcial_tiene_su_nota_de_credito()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ncp");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        await AutoInvoiceAsync(merchant, on: true);

        var order = await merchant.CreateSaleAsync(priceMinor: 10_000_00);
        await RunUntilAsync(order, docs => docs.Any(d => d.CbteTipo == CbteTipo.FacturaB && d.Result == FiscalResult.Authorized));

        // Dos parciales y el resto: tres NC, cada una por lo devuelto.
        await merchant.PostAsync($"/api/v1/orders/{order}/refund", new { amount = 3_000m });
        await merchant.PostAsync($"/api/v1/orders/{order}/refund", new { amount = 2_000m });
        await merchant.PostAsync($"/api/v1/orders/{order}/refund", new { });
        var notes = await RunUntilAsync(order, docs => CreditNotes(docs).Count == 3);
        Assert.Equal([2_000m, 3_000m, 5_000m], CreditNotes(notes).Select(d => d.ImpTotal).Order());

        // La venta ya no tiene nada devuelto sin acreditar ni nada por acreditar.
        var credit = (await merchant.GetAsync($"/api/v1/orders/{order}/fiscal")).GetProperty("credit");
        Assert.Equal(10_000_00, credit.GetProperty("credited").GetInt64());
        Assert.Equal(0, credit.GetProperty("remaining").GetInt64());
        Assert.Equal(0, credit.GetProperty("refundedUncredited").GetInt64());
    }

    [Fact]
    public async Task A_mano_con_y_sin_reembolso_hasta_el_total_de_la_factura()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ncm");
        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var order = await merchant.CreateSaleAsync(priceMinor: 10_000_00);
        Assert.True((await merchant.PostAsync($"/api/v1/orders/{order}/invoice", new { })).GetProperty("authorized").GetBoolean());

        // Facturación a mano: el reembolso no la emite solo, y la venta lo dice.
        await merchant.PostAsync($"/api/v1/orders/{order}/refund", new { amount = 4_000m });
        var status = await merchant.GetAsync($"/api/v1/orders/{order}/fiscal");
        Assert.False(status.GetProperty("autoInvoice").GetBoolean());
        Assert.Equal(4_000_00, status.GetProperty("credit").GetProperty("refundedUncredited").GetInt64());

        // La NC por lo devuelto, a mano: sale en el momento.
        var key = Guid.NewGuid().ToString();
        var first = await merchant.PostAsync($"/api/v1/orders/{order}/credit-notes", new { amount = 4_000m, reason = "Devolución", idempotencyKey = key });
        Assert.True(first.GetProperty("authorized").GetBoolean(), first.ToString());
        Assert.Equal("NotaCreditoB", first.GetProperty("cbteTipo").GetString());

        // El doble click (la misma clave) no emite otra: devuelve la misma.
        var cae = arca.CaeRequests;
        var again = await merchant.PostAsync($"/api/v1/orders/{order}/credit-notes", new { amount = 4_000m, idempotencyKey = key });
        Assert.Equal(first.GetProperty("documentId").GetGuid(), again.GetProperty("documentId").GetGuid());
        Assert.Equal(cae, arca.CaeRequests);
        Assert.Equal(0, (await merchant.GetAsync($"/api/v1/orders/{order}/fiscal")).GetProperty("credit").GetProperty("refundedUncredited").GetInt64());

        // Un ajuste sin reembolso (un precio corregido): también se puede.
        var adjust = await merchant.PostAsync($"/api/v1/orders/{order}/credit-notes", new { amount = 1_500m, idempotencyKey = Guid.NewGuid().ToString() });
        Assert.True(adjust.GetProperty("authorized").GetBoolean());

        // El tope: quedan 4.500 de la factura. Un centavo más es un error que lo dice.
        var over = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{order}/credit-notes",
            new { amount = 4_500.01m, idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);
        Assert.Contains("4.500,00", JsonDocument.Parse(await over.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString());

        // Sin clave o sin monto, no.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{order}/credit-notes", new { amount = 10m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{order}/credit-notes",
            new { amount = 0m, idempotencyKey = Guid.NewGuid().ToString() })).StatusCode);

        // Reembolsar tildando "emitir la nota de crédito": sale por la cola, por ese monto.
        await merchant.PostAsync($"/api/v1/orders/{order}/refund", new { amount = 2_000m, creditNote = true });
        var docs = await RunUntilAsync(order, d => CreditNotes(d).Count == 3);
        Assert.Equal(7_500m, CreditNotes(docs).Sum(d => d.ImpTotal));

        // Cada NC baja su PDF.
        foreach (var nc in CreditNotes(docs))
            await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{order}/invoice.pdf?type=creditnote&document={nc.Id}");

        // Una venta sin factura no tiene qué acreditar.
        var unbilled = await merchant.CreateSaleAsync(priceMinor: 1_000_00);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{unbilled}/credit-notes",
            new { amount = 100m, idempotencyKey = Guid.NewGuid().ToString() })).StatusCode);
    }

    [Fact]
    public async Task Ventas_filtra_las_facturadas_con_plata_devuelta_sin_nota_de_credito()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ncf");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var pending = await merchant.CreateSaleAsync(priceMinor: 5_000_00);
        var covered = await merchant.CreateSaleAsync(priceMinor: 5_000_00);
        var notInvoiced = await merchant.CreateSaleAsync(priceMinor: 5_000_00);
        foreach (var o in new[] { pending, covered })
            await merchant.PostAsync($"/api/v1/orders/{o}/invoice", new { });
        foreach (var o in new[] { pending, covered, notInvoiced })
            await merchant.PostAsync($"/api/v1/orders/{o}/refund", new { amount = 1_000m });
        await merchant.PostAsync($"/api/v1/orders/{covered}/credit-notes", new { amount = 1_000m, idempotencyKey = Guid.NewGuid().ToString() });

        var list = await merchant.GetAsync($"/api/v1/orders?limit=25&fiscal={OrderCreditNotes.RefundedUncreditedFilter}");
        Assert.Equal([pending], list.GetProperty("items").EnumerateArray().Select(o => o.GetProperty("id").GetGuid()));
        Assert.Equal(1, list.GetProperty("total").GetInt32());
    }

    // ---------------------------------------------------------------- helpers

    private static List<global::Fiscal.Core.Domain.FiscalDocument> CreditNotes(IEnumerable<global::Fiscal.Core.Domain.FiscalDocument> docs) =>
        [.. docs.Where(d => d.Result == FiscalResult.Authorized
            && d.CbteTipo is CbteTipo.NotaCreditoA or CbteTipo.NotaCreditoB or CbteTipo.NotaCreditoC)];

    private static async Task AutoInvoiceAsync(Merchant merchant, bool on)
    {
        var pos = (await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items")[0].GetProperty("id").GetGuid();
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = on,
            trigger = "PAYMENT",
            defaultPointOfSaleId = pos,
            consumerFinalThresholdMinorUnits = 0L,
        });
    }

    /// <summary>Corre el worker de emisión hasta que los comprobantes de la venta cumplan la condición.</summary>
    private async Task<List<global::Fiscal.Core.Domain.FiscalDocument>> RunUntilAsync(
        Guid orderId, Func<List<global::Fiscal.Core.Domain.FiscalDocument>, bool> done)
    {
        var docs = new List<global::Fiscal.Core.Domain.FiscalDocument>();
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            docs = await db.Documents.AsNoTracking().Where(d => d.OrderId == orderId).ToListAsync();
            if (done(docs)) return docs;
        }
        Assert.Fail($"Los comprobantes de la venta {orderId} no llegaron: [{string.Join("; ", docs.Select(d => $"{d.CbteTipo} {d.Result} {d.ImpTotal}"))}]");
        return docs;
    }
}
