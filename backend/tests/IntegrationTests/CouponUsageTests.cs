using System.Net;
using System.Text.Json;
using Api.Orders;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// El límite de usos de un cupón, cumplido aunque las compras lleguen juntas:
/// el uso se toma al crear la venta (con un UPDATE condicional, no leyendo el
/// contador y sumando después) y vuelve si la venta se cancela, vence o el
/// pago se rechaza sin cobrarse. Antes se contaba recién al pagar: un cupón
/// de un solo uso lo podían usar todas las compras que se armaran antes del
/// primer pago.
/// </summary>
[Collection("api")]
public sealed class CouponUsageTests(ApiFactory factory)
{
    private const string MercadoPagoApi = "https://api.mercadopago.com";

    private static object TransferOptions() => new
    {
        transferEnabled = true,
        discountPercent = 0,
        bankName = "Banco Nación",
        accountHolder = "Tienda de Test SRL",
        holderTaxId = "30-71234567-8",
        cbu = "0110599520000012345678",
        alias = "TIENDA.TEST.PAGOS",
        instructions = "Mandanos el comprobante.",
        holdHours = 48,
        cashOnPickupEnabled = false,
        installmentsMax = 6,
        installmentsNote = "",
    };

    private static async Task<Merchant> StoreWithCouponAsync(ApiFactory factory, string tag, string code, int? maxUses)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions());
        await merchant.PostAsync("/api/v1/coupons", new
        {
            code,
            type = "percent",
            value = 10,
            minPurchase = 0L,
            maxUses,
            active = true,
        });
        return merchant;
    }

    private static async Task<int> UsedCountAsync(Merchant merchant, string code) =>
        (await merchant.GetAsync($"/api/v1/coupons?q={code}")).GetProperty("items").EnumerateArray()
            .Single(c => c.GetProperty("code").GetString() == code)
            .GetProperty("usedCount").GetInt32();

    private static Task<HttpResponseMessage> PayByTransferAsync(Shopper shopper, Guid checkoutId, string code) =>
        shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline",
            new { method = "transfer", couponCode = code });

    private static async Task<Guid> OrderIdAsync(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<JsonElement>(Merchant.Json)).GetProperty("orderId").GetGuid();
    }

    [Fact]
    public async Task Un_cupon_de_un_uso_lo_toma_una_sola_compra_aunque_lleguen_juntas()
    {
        const string code = "UNAVEZ";
        var merchant = await StoreWithCouponAsync(factory, "cpn", code, maxUses: 1);
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 20);

        var shoppers = Enumerable.Range(0, 6).Select(_ => new Shopper(merchant)).ToList();
        var checkouts = new List<Guid>();
        foreach (var s in shoppers) checkouts.Add(await s.CheckoutAsync(variantId));

        var responses = await Task.WhenAll(shoppers.Select((s, i) => PayByTransferAsync(s, checkouts[i], code)));

        var won = Assert.Single(responses, r => r.IsSuccessStatusCode);
        foreach (var lost in responses.Where(r => !r.IsSuccessStatusCode))
        {
            Assert.Equal(HttpStatusCode.Conflict, lost.StatusCode);
            Assert.Contains("El cupón alcanzó su límite de usos.", await lost.Content.ReadAsStringAsync());
        }
        Assert.Equal(1, await UsedCountAsync(merchant, code));

        // La que ganó lleva el descuento: 10% de 10.000.
        var orderId = await OrderIdAsync(won);
        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal(1_000_00, order.GetProperty("discount").GetProperty("amount").GetInt64());

        // Más tarde, con el contador ya visible, tampoco pasa (antes el cupón
        // agotado se ignoraba y el comprador pagaba sin el descuento que vio).
        var late = new Shopper(merchant);
        var lateCheckout = await late.CheckoutAsync(variantId);
        var again = await PayByTransferAsync(late, lateCheckout, code);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(1, await UsedCountAsync(merchant, code));
    }

    [Fact]
    public async Task El_doble_clic_de_la_misma_compra_no_gasta_dos_usos()
    {
        const string code = "DOBLE";
        var merchant = await StoreWithCouponAsync(factory, "cpd", code, maxUses: 1);
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId);

        var responses = await Task.WhenAll(
            PayByTransferAsync(shopper, checkoutId, code),
            PayByTransferAsync(shopper, checkoutId, code),
            PayByTransferAsync(shopper, checkoutId, code));

        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode, r.StatusCode.ToString()));
        var orderId = Assert.Single((await Task.WhenAll(responses.Select(OrderIdAsync))).Distinct());
        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal(1_000_00, order.GetProperty("discount").GetProperty("amount").GetInt64());
        Assert.Equal(1, await UsedCountAsync(merchant, code));
    }

    [Fact]
    public async Task Cancelar_la_venta_sin_cobrar_devuelve_el_uso_y_pagarla_no_lo_vuelve_a_sumar()
    {
        const string code = "VUELVE";
        var merchant = await StoreWithCouponAsync(factory, "cpc", code, maxUses: 1);
        var (_, variantId) = await merchant.CreateProductAsync("Bombilla", priceMinor: 10_000_00, stock: 5);

        var first = new Shopper(merchant);
        var firstOrder = await OrderIdAsync(await PayByTransferAsync(first, await first.CheckoutAsync(variantId), code));
        Assert.Equal(1, await UsedCountAsync(merchant, code));

        await merchant.PostAsync($"/api/v1/orders/{firstOrder}/cancel", new { reason = "Se arrepintió" });
        Assert.Equal(0, await UsedCountAsync(merchant, code));

        // Cancelar dos veces no devuelve dos usos.
        await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{firstOrder}/cancel", new { });
        Assert.Equal(0, await UsedCountAsync(merchant, code));

        // Otro comprador lo puede usar, y al cobrarse sigue siendo un uso.
        var second = new Shopper(merchant);
        var secondOrder = await OrderIdAsync(await PayByTransferAsync(second, await second.CheckoutAsync(variantId), code));
        Assert.Equal(1, await UsedCountAsync(merchant, code));
        Assert.Equal("PAID", (await merchant.PostAsync($"/api/v1/orders/{secondOrder}/mark-paid", new { }))
            .GetProperty("status").GetString());
        Assert.Equal(1, await UsedCountAsync(merchant, code));
    }

    [Fact]
    public async Task La_transferencia_que_vence_devuelve_el_uso()
    {
        const string code = "VENCE";
        var merchant = await StoreWithCouponAsync(factory, "cpv", code, maxUses: 3);
        var (_, variantId) = await merchant.CreateProductAsync("Yerba", priceMinor: 4_000_00, stock: 5);
        var shopper = new Shopper(merchant);
        var orderId = await OrderIdAsync(await PayByTransferAsync(shopper, await shopper.CheckoutAsync(variantId), code));
        Assert.Equal(1, await UsedCountAsync(merchant, code));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE orders SET payment_due_at_utc = {DateTime.UtcNow.AddMinutes(-1)} WHERE id = {orderId}");
        }
        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);

        Assert.Equal("CANCELLED", (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("status").GetString());
        Assert.Equal(0, await UsedCountAsync(merchant, code));
    }

    [Fact]
    public async Task El_pago_rechazado_devuelve_el_uso()
    {
        const string code = "RECHAZO";
        var merchant = await StoreWithCouponAsync(factory, "cpr", code, maxUses: 1);
        await merchant.ConnectMercadoPagoAsync(Random.Shared.NextInt64(1_000_000, 9_000_000_000));
        var (_, variantId) = await merchant.CreateProductAsync("Matera", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);

        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{MercadoPagoApi}/v1/payments", new
        {
            id = Random.Shared.NextInt64(100_000_000, 999_999_999),
            status = "rejected",
            status_detail = "cc_rejected_insufficient_amount",
        });
        var checkoutId = await shopper.CheckoutAsync(variantId);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa", couponCode = code });
        Assert.Equal("rejected", paid.GetProperty("status").GetString());

        Assert.Equal(0, await UsedCountAsync(merchant, code));
    }

    /// <summary>
    /// La venta no llega a nacer por una excepción (la base se cae a mitad, un
    /// bug), no por un rechazo: el uso que se tomó para ella tiene que volver.
    /// Antes solo volvía con un Failure, y un cupón de un uso quedaba agotado
    /// sin ninguna venta.
    /// </summary>
    [Fact]
    public async Task Si_crear_la_venta_tira_una_excepcion_el_uso_vuelve()
    {
        const string code = "EXCEPCION";
        var merchant = await StoreWithCouponAsync(factory, "cpx", code, maxUses: 1);
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId);

        // La misma API, con la base de ventas rota justo al guardar la venta nueva.
        await using (var broken = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.AddScoped<OrderRepository>();
            services.AddScoped<IOrderRepository>(sp => new SaveFails(sp.GetRequiredService<OrderRepository>()));
        })))
        {
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline")
            {
                Content = JsonContent.Create(new { method = "transfer", couponCode = code }),
            };
            req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            req.Headers.Add("Origin", shopper.ReturnUrl);
            var res = await broken.CreateClient().SendAsync(req);
            Assert.Equal(HttpStatusCode.InternalServerError, res.StatusCode);
        }

        Assert.Equal(0, await UsedCountAsync(merchant, code));

        // Y la misma compra, ya sin la falla, lo toma y paga con el descuento.
        var orderId = await OrderIdAsync(await PayByTransferAsync(shopper, checkoutId, code));
        Assert.Equal(1_000_00, (await merchant.GetAsync($"/api/v1/orders/{orderId}"))
            .GetProperty("discount").GetProperty("amount").GetInt64());
        Assert.Equal(1, await UsedCountAsync(merchant, code));
    }

    /// <summary>El repositorio de ventas de verdad, salvo que guardar la venta de un checkout falla.</summary>
    private sealed class SaveFails(OrderRepository inner) : IOrderRepository
    {
        public Task<(Order Order, bool IsNew)> AddOncePerCheckoutAsync(Order order, CancellationToken ct = default) =>
            throw new InvalidOperationException("La base se cayó a mitad de la venta.");

        public Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) => inner.GetByIdAsync(tenantId, id, ct);
        public Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default) => inner.GetByIdAnyTenantAsync(id, ct);
        public Task<Order?> GetByNumberAsync(TenantId tenantId, int number, CancellationToken ct = default) => inner.GetByNumberAsync(tenantId, number, ct);
        public Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default) => inner.ListAsync(tenantId, limit, afterId, ct);
        public Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(TenantId tenantId, int limit, int offset, OrderListFilter filter, CancellationToken ct = default) => inner.ListPageAsync(tenantId, limit, offset, filter, ct);
        public IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, OrderListFilter filter) => inner.StreamAsync(tenantId, filter);
        public Task<int> CountAsync(TenantId tenantId, OrderListFilter filter, CancellationToken ct = default) => inner.CountAsync(tenantId, filter, ct);
        public Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default) => inner.ListByBuyerEmailAsync(tenantId, email, ct);
        public Task<Order?> GetByCheckoutSessionAsync(TenantId tenantId, Guid checkoutSessionId, CancellationToken ct = default) => inner.GetByCheckoutSessionAsync(tenantId, checkoutSessionId, ct);
        public Task AddAsync(Order order, CancellationToken ct = default) => inner.AddAsync(order, ct);
        public Task SaveChangesAsync(CancellationToken ct = default) => inner.SaveChangesAsync(ct);
    }
}
