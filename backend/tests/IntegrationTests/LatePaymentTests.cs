using System.Text.Json;
using Inventory.Core.Domain;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;

namespace IntegrationTests;

/// <summary>
/// Pagos que llegan tarde: después de que venció la reserva de stock, sobre
/// una venta que figuraba rechazada o cancelada, o nunca (la compra con
/// tarjeta abandonada). La plata que entró siempre deja la venta pagada; lo
/// que el sistema no puede resolver solo (no había stock, la venta figuraba
/// cancelada) le queda al comercio "para revisar".
/// </summary>
[Collection("api")]
public sealed class LatePaymentTests(ApiFactory factory)
{
    private const string Api = "https://api.mercadopago.com";

    [Fact]
    public async Task Un_pago_aprobado_con_la_reserva_vencida_descuenta_el_stock_igual()
    {
        var (merchant, mpUserId, shopper) = await StoreAsync("tar");
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 25_000_00, stock: 3);
        var orderId = await PayWithCheckoutProAsync(shopper, variantId);

        // La reserva venció por la hora, pero el job todavía no la liberó: el
        // pago la suelta y descuenta una sola vez.
        await ExpireReservationsAsync(orderId, release: false);

        await ApproveAsync(mpUserId, orderId, NewPaymentId());

        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("PAID", order.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, order.GetProperty("reviewNote").ValueKind);
        await AssertStockAsync(merchant, variantId, available: 2, reserved: 0);

        // El job pasa después y no hay nada que devolver.
        await ReleaseExpiredAsync();
        await AssertStockAsync(merchant, variantId, available: 2, reserved: 0);
    }

    [Fact]
    public async Task Un_pago_aprobado_sin_stock_queda_pagado_y_para_revisar()
    {
        var (merchant, mpUserId, shopper) = await StoreAsync("tas");
        var (_, variantId) = await merchant.CreateProductAsync("Carpa", priceMinor: 90_000_00, stock: 1);
        var orderId = await PayWithCheckoutProAsync(shopper, variantId);

        // La reserva vence, el stock vuelve a la venta y se vende por otro lado.
        await ExpireReservationsAsync(orderId, release: true);
        await AssertStockAsync(merchant, variantId, available: 1, reserved: 0);
        await merchant.PutAsync($"/api/v1/inventory/{variantId}", new { available = 0, reason = "Venta en el local" });

        await ApproveAsync(mpUserId, orderId, NewPaymentId());

        // La plata entró: la venta queda pagada, el stock no baja de cero y el
        // comercio se entera de qué falta.
        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("PAID", order.GetProperty("status").GetString());
        var note = order.GetProperty("reviewNote").GetString();
        Assert.Contains("no había stock de Carpa", note);
        Assert.Contains("reponelo o devolvé el pago", note);
        await AssertStockAsync(merchant, variantId, available: 0, reserved: 0);

        // Sale en el Inicio y en el filtro del listado.
        Assert.True((await merchant.GetAsync("/api/v1/home/todo")).GetProperty("toReview").GetInt32() >= 1);
        var toReview = await merchant.GetAsync("/api/v1/orders?review=true");
        Assert.Contains(toReview.GetProperty("items").EnumerateArray(), o => o.GetProperty("id").GetGuid() == orderId);

        // El comprador no ve la nota del equipo.
        var mine = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/summary");
        Assert.DoesNotContain("reponelo", mine.ToString());

        // "Ya lo revisé": sale de la lista.
        var resolved = await merchant.PostAsync($"/api/v1/orders/{orderId}/review/resolve", new { });
        Assert.Equal(JsonValueKind.Null, resolved.GetProperty("reviewNote").ValueKind);
        Assert.DoesNotContain((await merchant.GetAsync("/api/v1/orders?review=true")).GetProperty("items").EnumerateArray(),
            o => o.GetProperty("id").GetGuid() == orderId);
    }

    /// <summary>
    /// Checkout Pro deja reintentar en el mismo link: cada intento es un pago
    /// con el mismo external_reference. El rechazo de la primera tarjeta deja
    /// la venta fallida (y el stock vuelve a la venta); el aprobado de la
    /// segunda antes se ignoraba "por idempotente" y el comprador quedaba
    /// cobrado con la venta fallida.
    /// </summary>
    [Fact]
    public async Task Un_rechazo_y_despues_un_aprobado_en_la_misma_venta_la_dejan_pagada()
    {
        var (merchant, mpUserId, shopper) = await StoreAsync("tarr");
        var (_, variantId) = await merchant.CreateProductAsync("Linterna", priceMinor: 8_000_00, stock: 2);
        var buyer = $"reintento-{merchant.Subdomain}@test.local";
        var orderId = await PayWithCheckoutProAsync(shopper, variantId, email: buyer);

        await NotifyAsync(mpUserId, orderId, NewPaymentId(), "rejected");
        Assert.Equal("FAILED", (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("status").GetString());
        await AssertStockAsync(merchant, variantId, available: 2, reserved: 0);

        var approved = NewPaymentId();
        await ApproveAsync(mpUserId, orderId, approved);

        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("PAID", order.GetProperty("status").GetString());
        Assert.Equal(approved, order.GetProperty("paymentId").GetString());
        Assert.Contains("con el pago rechazado", order.GetProperty("reviewNote").GetString());
        await AssertStockAsync(merchant, variantId, available: 1, reserved: 0);
        // Con todo lo de una venta pagada: el comprador recibe la confirmación.
        Assert.Contains(factory.ExternalHttp.SentTo(ApiFactory.ResendEmails),
            r => r.Body!.Contains(buyer) && r.Body.Contains("Confirmamos tu pago"));

        // El aviso repetido del mismo pago no descuenta dos veces.
        await MercadoPagoWebhooks.SendAsync(factory, approved, mpUserId);
        await MercadoPagoWebhooks.DrainAsync(factory);
        await AssertStockAsync(merchant, variantId, available: 1, reserved: 0);
    }

    [Fact]
    public async Task Un_pago_aprobado_sobre_una_venta_cancelada_a_mano_la_deja_pagada_y_para_revisar()
    {
        var (merchant, mpUserId, shopper) = await StoreAsync("tarc");
        var (_, variantId) = await merchant.CreateProductAsync("Reposera", priceMinor: 30_000_00, stock: 1);
        var orderId = await PayWithCheckoutProAsync(shopper, variantId);

        // El comercio la cancela (y el link no se pudo anular en MP).
        await merchant.PostAsync($"/api/v1/orders/{orderId}/cancel", new { reason = "El cliente no contestó" });
        await AssertStockAsync(merchant, variantId, available: 1, reserved: 0);

        await ApproveAsync(mpUserId, orderId, NewPaymentId());

        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("PAID", order.GetProperty("status").GetString());
        Assert.Contains("Figuraba cancelada (El cliente no contestó)", order.GetProperty("reviewNote").GetString());
        Assert.Equal(JsonValueKind.Null, order.GetProperty("cancelledAtUtc").ValueKind);
        await AssertStockAsync(merchant, variantId, available: 0, reserved: 0);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<(Merchant Merchant, long MpUserId, Shopper Shopper)> StoreAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        return (merchant, mpUserId, new Shopper(merchant));
    }

    private static string NewPaymentId() => Random.Shared.NextInt64(100_000_000, 999_999_999).ToString();

    /// <summary>El comprador va a pagar con Checkout Pro: la venta queda pendiente con su link.</summary>
    private async Task<Guid> PayWithCheckoutProAsync(Shopper shopper, Guid variantId, int quantity = 1,
        string email = "comprador@test.local")
    {
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity, email: email);
        var preferenceId = $"pref-{Guid.NewGuid():N}";
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/checkout/preferences",
            new { id = preferenceId, init_point = $"https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id={preferenceId}" });
        var pay = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        return pay.GetProperty("orderId").GetGuid();
    }

    /// <summary>MP avisa un pago de la venta con ese estado y el worker lo aplica.</summary>
    private async Task NotifyAsync(long mpUserId, Guid orderId, string paymentId, string status)
    {
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", new
        {
            id = long.Parse(paymentId),
            status,
            status_detail = status == "approved" ? "accredited" : "cc_rejected_other_reason",
            external_reference = orderId.ToString(),
            transaction_amount = 1_000m,
            transaction_amount_refunded = 0m,
        });
        await MercadoPagoWebhooks.SendAsync(factory, paymentId, mpUserId);
        await MercadoPagoWebhooks.DrainAsync(factory);
    }

    private Task ApproveAsync(long mpUserId, Guid orderId, string paymentId) =>
        NotifyAsync(mpUserId, orderId, paymentId, "approved");

    /// <summary>Las reservas de la venta, vencidas por la hora; con <paramref name="release"/>, además liberadas por el job.</summary>
    private async Task ExpireReservationsAsync(Guid orderId, bool release)
    {
        using var scope = factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        var reservationIds = await orders.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.Id == orderId)
            .SelectMany(o => o.Items.Where(i => i.ReservationId != null).Select(i => i.ReservationId!.Value))
            .ToListAsync();
        Assert.NotEmpty(reservationIds);

        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        await inventory.Reservations.IgnoreQueryFilters()
            .Where(r => reservationIds.Contains(r.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
        if (release) await ReleaseExpiredAsync();
    }

    private async Task ReleaseExpiredAsync()
    {
        using var scope = factory.Services.CreateScope();
        var stock = scope.ServiceProvider.GetRequiredService<IStockRepository>();
        // De a 100 por pasada: la base de tests guarda reservas de otras corridas.
        while (await stock.ReleaseExpiredAsync(DateTime.UtcNow) > 0) { }
    }

    private static async Task AssertStockAsync(Merchant merchant, Guid variantId, int available, int reserved)
    {
        var item = (await merchant.GetAsync($"/api/v1/inventory?variantIds={variantId}"))
            .GetProperty("items").EnumerateArray().Single();
        Assert.Equal(available, item.GetProperty("available").GetInt32());
        Assert.Equal(reserved, item.GetProperty("reserved").GetInt32());
    }
}
