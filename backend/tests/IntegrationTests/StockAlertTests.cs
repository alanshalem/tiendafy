using System.Net;
using Api.Middleware;
using Api.Purchasing;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Alertas de stock bajo: se avisa UNA vez cada vez que una variante cruza su
/// punto de reposición (no en cada pasada mientras siga baja), vuelve a avisar
/// en el próximo cruce después de reponerse, y respeta lo silenciado y las
/// bajas personales.
/// </summary>
[Collection("api")]
public sealed class StockAlertTests(ApiFactory factory)
{
    [Fact]
    public async Task Avisa_una_vez_por_cruce()
    {
        var store = await Merchant.CreateAsync(factory, "stk");
        var (_, variant) = await store.CreateProductAsync("Filtro de aceite", stock: 3, sku: $"FIL-{store.Subdomain}");
        int Alerts() => factory.ExternalHttp.EmailsTo(store.Email).Count(e => e.Subject.StartsWith("Stock bajo", StringComparison.Ordinal));

        // Mínimo propio de 5: con 3 está bajo (sin ventas, la señal de reposición no lo vería).
        await store.PutAsync($"/api/v1/stock-alerts/rules/{variant}", new { minUnits = 5, muted = false });
        var low = await store.GetAsync("/api/v1/stock-alerts");
        var item = Assert.Single(low.GetProperty("items").EnumerateArray());
        Assert.Equal("minimo", item.GetProperty("reason").GetString());
        Assert.Equal(7, item.GetProperty("suggestedQty").GetInt32()); // hasta el doble del mínimo
        Assert.Equal(1, (await store.GetAsync("/api/v1/stock-alerts/count")).GetProperty("count").GetInt32());

        // Apagadas (lo de fábrica): no se avisa nada.
        await Workers.RunOnceAsync<StockAlertWorker>(factory);
        Assert.Equal(0, Alerts());

        // Inmediato: la pasada del worker avisa…
        await store.PutAsync("/api/v1/stock-alerts/settings", new { mode = "inmediato" });
        await Workers.RunOnceAsync<StockAlertWorker>(factory);
        Assert.Equal(1, Alerts());
        Assert.NotNull((await store.GetAsync("/api/v1/stock-alerts")).GetProperty("items")[0].GetProperty("notifiedAtUtc").GetString());

        // …y mientras siga bajo, no vuelve a avisar.
        await EvaluateAsync(store.TenantId);
        await EvaluateAsync(store.TenantId);
        Assert.Equal(1, Alerts());

        // Se repone: sin aviso. Vuelve a bajar: es otro cruce, otro aviso.
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}", new { available = 50, reason = "llegó la compra" });
        await EvaluateAsync(store.TenantId);
        Assert.Equal(1, Alerts());
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}", new { available = 2, reason = "venta grande" });
        await EvaluateAsync(store.TenantId);
        Assert.Equal(2, Alerts());

        // Baja personal: el cruce siguiente ya no le llega.
        await store.PutAsync("/api/v1/stock-alerts/settings/me", new { optOut = true });
        var settings = await store.GetAsync("/api/v1/stock-alerts/settings");
        Assert.True(settings.GetProperty("me").GetProperty("optedOut").GetBoolean());
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}", new { available = 50, reason = "repuesto" });
        await EvaluateAsync(store.TenantId);
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}", new { available = 1, reason = "otra venta" });
        await EvaluateAsync(store.TenantId);
        Assert.Equal(2, Alerts());

        // Silenciado: sale de la lista.
        await store.PutAsync($"/api/v1/stock-alerts/rules/{variant}", new { minUnits = 5, muted = true });
        Assert.Empty((await store.GetAsync("/api/v1/stock-alerts")).GetProperty("items").EnumerateArray());

        // Otra tienda no ve nada de esto.
        var other = await Merchant.CreateAsync(factory, "sto");
        Assert.Empty((await other.GetAsync("/api/v1/stock-alerts")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Put,
            $"/api/v1/stock-alerts/rules/{variant}", new { minUnits = 1, muted = false })).StatusCode);
    }

    [Fact]
    public async Task El_resumen_diario_sale_una_vez_por_dia_a_la_hora_elegida()
    {
        var store = await Merchant.CreateAsync(factory, "std");
        var (_, variant) = await store.CreateProductAsync("Cadena", stock: 1, sku: $"CAD-{store.Subdomain}");
        int Alerts() => factory.ExternalHttp.EmailsTo(store.Email).Count(e => e.Subject.StartsWith("Stock bajo", StringComparison.Ordinal));

        await store.PutAsync($"/api/v1/stock-alerts/rules/{variant}", new { minUnits = 3, muted = false });
        await store.PutAsync("/api/v1/stock-alerts/settings", new { mode = "diario", digestHour = 9 });

        // 8 de la mañana en Argentina (11 UTC): todavía no.
        var day = DateTime.UtcNow.Date.AddDays(1);
        await EvaluateAsync(store.TenantId, day.AddHours(11));
        Assert.Equal(0, Alerts());

        // 9:30: sale el resumen; a las 15, no se repite.
        await EvaluateAsync(store.TenantId, day.AddHours(12.5));
        Assert.Equal(1, Alerts());
        await EvaluateAsync(store.TenantId, day.AddHours(18));
        Assert.Equal(1, Alerts());

        // Sin permiso de ajustar stock no se cambia la configuración de la tienda.
        var seller = await store.AddTeammateAsync("vendedor");
        Assert.Equal(HttpStatusCode.Forbidden, await seller.StatusAsync(HttpMethod.Put, "/api/v1/stock-alerts/settings", new { mode = "off" }));
        Assert.Equal(HttpStatusCode.OK, await seller.StatusAsync(HttpMethod.Get, "/api/v1/stock-alerts"));
    }

    /// <summary>Una pasada de evaluación para esa tienda, como la haría el worker (sin esperar su turno).</summary>
    private async Task EvaluateAsync(Guid tenantId, DateTime? nowUtc = null)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(tenantId));
        await scope.ServiceProvider.GetRequiredService<StockAlertService>()
            .EvaluateAsync(TenantId.From(tenantId), nowUtc ?? DateTime.UtcNow, CancellationToken.None);
    }
}
