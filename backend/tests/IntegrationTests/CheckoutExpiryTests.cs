using System.Net;
using System.Text.Json;
using Api.Orders;
using Checkout.Infrastructure.Persistence;
using Inventory.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Un checkout que vence pasa a "vencido" (Expired) cuando ya no le queda
/// stock reservado. Antes el job de Inventario liberaba la reserva pero la
/// sesión quedaba "enviada" para siempre, y el estado Expired no se escribía
/// nunca. El comprador que vuelve con una compra vencida tiene que poder
/// empezar de nuevo desde el carrito, no quedar trabado.
/// </summary>
[Collection("api")]
public sealed class CheckoutExpiryTests(ApiFactory factory)
{
    [Fact]
    public async Task Un_checkout_abierto_que_vence_queda_vencido_y_se_puede_empezar_de_nuevo()
    {
        var merchant = await Merchant.CreateAsync(factory, "cxo");
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 20_000_00, stock: 5);
        var shopper = new Shopper(merchant);

        // Armó el carrito y se fue sin completar los datos.
        var open = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId, quantity = 1 } } })).GetProperty("id").GetGuid();
        Assert.Equal("OPEN", await StatusAsync(shopper, open));

        await DueAsync(open);
        await SweepUntilAsync(open, "Expired");
        Assert.Equal("EXPIRED", await StatusAsync(shopper, open));

        // Si vuelve con esa compra, le dice que venció (no "ya no se puede modificar").
        var late = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{open}/submit",
            new { email = "vuelve@test.local", name = "Ana" });
        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
        Assert.Contains("venció", await DetailAsync(late));

        // Y empezar de nuevo funciona: otra compra con el mismo carrito.
        var again = await shopper.CheckoutAsync(variantId, email: "vuelve@test.local");
        Assert.Equal("SUBMITTED", await StatusAsync(shopper, again));
        Assert.Equal(4, await merchant.AvailableAsync(variantId));
    }

    [Fact]
    public async Task Un_checkout_enviado_vence_cuando_su_reserva_vuelve_al_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "cxs");
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);

        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 2);
        Assert.Equal(3, await merchant.AvailableAsync(variantId));

        // Con el plazo cumplido pero la reserva todavía activa, no se toca:
        // "vencida" quiere decir que el stock ya volvió.
        await DueAsync(checkoutId);
        await Workers.RunOnceAsync<ExpiredCheckoutWorker>(factory);
        Assert.Equal("SUBMITTED", await StatusAsync(shopper, checkoutId));

        // La reserva vuelve al stock (lo que hace el job de Inventario al vencer).
        using (var scope = factory.Services.CreateScope())
        {
            var checkoutDb = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            var inventory = scope.ServiceProvider.GetRequiredService<IInventoryService>();
            var session = await checkoutDb.Sessions.IgnoreQueryFilters().AsNoTracking().SingleAsync(s => s.Id == checkoutId);
            foreach (var item in session.Items)
                Assert.True((await inventory.ReleaseReservationAsync(merchant.TenantId, item.ReservationId!.Value)).IsSuccess);
        }
        Assert.Equal(5, await merchant.AvailableAsync(variantId));

        await SweepUntilAsync(checkoutId, "Expired");
        Assert.Equal("EXPIRED", await StatusAsync(shopper, checkoutId));

        // Pagar una compra vencida no crea una venta sobre stock que ya no está
        // reservado: pide volver a empezar.
        var pay = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay",
            new { returnUrl = shopper.ReturnUrl });
        Assert.Equal(HttpStatusCode.Conflict, pay.StatusCode);
        Assert.Contains("venció", await DetailAsync(pay));
        Assert.Equal(5, await merchant.AvailableAsync(variantId));
    }

    [Fact]
    public async Task Un_checkout_que_termina_en_una_venta_cobrada_queda_completado()
    {
        var merchant = await Merchant.CreateAsync(factory, "cxc");
        await merchant.PutAsync("/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 0,
            bankName = "Banco Nación",
            accountHolder = "Tienda de Test SRL",
            holderTaxId = "30-71234567-8",
            cbu = "0110599520000012345678",
            alias = "TIENDA.TEST.PAGOS",
            holdHours = 48,
        });
        var (_, variantId) = await merchant.CreateProductAsync("Yerbera", priceMinor: 8_000_00, stock: 5);
        var shopper = new Shopper(merchant);

        var checkoutId = await shopper.CheckoutAsync(variantId, email: $"transfer-{merchant.Subdomain}@test.local");
        var placed = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline",
            new { method = "transfer" });
        var orderId = placed.GetProperty("orderId").GetGuid();

        // Esperando la transferencia: la reserva se estiró horas, así que la
        // sesión no vence aunque su media hora haya pasado.
        await DueAsync(checkoutId);
        await Workers.RunOnceAsync<ExpiredCheckoutWorker>(factory);
        Assert.Equal("SUBMITTED", await StatusAsync(shopper, checkoutId));

        // Llegó la plata: la compra terminó en venta.
        await merchant.PostAsync($"/api/v1/orders/{orderId}/mark-paid", new { });
        await SweepUntilAsync(checkoutId, "Completed");
        Assert.Equal("COMPLETED", await StatusAsync(shopper, checkoutId));
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<string?> StatusAsync(Shopper shopper, Guid checkoutId) =>
        (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/checkout/{checkoutId}")).GetProperty("status").GetString();

    private static async Task<string> DetailAsync(HttpResponseMessage res) =>
        JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString() ?? "";

    /// <summary>La sesión con el plazo cumplido (hace un minuto).</summary>
    private async Task DueAsync(Guid checkoutId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
        await db.Sessions.IgnoreQueryFilters().Where(s => s.Id == checkoutId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
    }

    /// <summary>
    /// El barrido toma las sesiones vencidas de TODA la base (que persiste
    /// entre corridas), las más viejas primero: puede tener que pasar más de
    /// una vez.
    /// </summary>
    private async Task SweepUntilAsync(Guid checkoutId, string status)
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<ExpiredCheckoutWorker>(factory);
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            var current = await db.Sessions.IgnoreQueryFilters().AsNoTracking()
                .Where(s => s.Id == checkoutId).Select(s => s.Status).SingleAsync();
            if (current.ToString() == status) return;
        }
        Assert.Fail($"El checkout nunca quedó {status}.");
    }
}
