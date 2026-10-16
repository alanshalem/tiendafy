using System.Net;
using System.Text.Json;
using Inventory.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La API de inventario de punta a punta: ubicación en el depósito, ajuste
/// manual (nunca negativo), reservas —tomar, confirmar, liberar, y no más de
/// lo que hay, por la misma puerta que usa el checkout— y el libro de
/// movimientos que lo explica todo.
/// </summary>
[Collection("api")]
public sealed class InventoryApiTests(ApiFactory factory)
{
    /// <summary>Las reservas las toma el checkout por el contrato del módulo, no por HTTP.</summary>
    private async Task<T> WithInventoryAsync<T>(Func<IInventoryService, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<IInventoryService>());
    }

    [Fact]
    public async Task Ubicacion_ajuste_reservas_y_libro_de_movimientos()
    {
        var merchant = await Merchant.CreateAsync(factory, "inv");
        var (_, variant) = await merchant.CreateProductAsync("Mancuerna 5kg", stock: 4);

        // Ubicación física: hasta 60 caracteres.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}/location", new { location = "Estante B · Fila 3" });
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put,
            $"/api/v1/inventory/{variant}/location", new { location = new string('x', 61) })).StatusCode);

        // Ajuste manual: nunca negativo.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put,
            $"/api/v1/inventory/{variant}", new { available = -1, reason = "error" })).StatusCode);
        var set = await merchant.PutAsync($"/api/v1/inventory/{variant}", new { available = 6, reason = "Conteo" });
        Assert.Equal(6, set.GetProperty("available").GetInt32());

        // Reservar, confirmar, liberar.
        var reservation = await WithInventoryAsync(i => i.ReserveAsync(merchant.TenantId, variant, 2));
        Assert.Equal("ACTIVE", reservation.Value.Status);
        Assert.Equal(4, await merchant.AvailableAsync(variant));
        Assert.True((await WithInventoryAsync(i => i.ConfirmReservationAsync(merchant.TenantId, reservation.Value.Id))).IsSuccess);

        var released = await WithInventoryAsync(i => i.ReserveAsync(merchant.TenantId, variant, 1));
        Assert.True((await WithInventoryAsync(i => i.ReleaseReservationAsync(merchant.TenantId, released.Value.Id))).IsSuccess);
        Assert.Equal(4, await merchant.AvailableAsync(variant));

        // No se reserva más de lo que hay, ni se confirma/libera lo que no existe.
        Assert.True((await WithInventoryAsync(i => i.ReserveAsync(merchant.TenantId, variant, 50))).IsFailure);
        Assert.True((await WithInventoryAsync(i => i.ConfirmReservationAsync(merchant.TenantId, Guid.NewGuid()))).IsFailure);
        Assert.True((await WithInventoryAsync(i => i.ReleaseReservationAsync(merchant.TenantId, Guid.NewGuid()))).IsFailure);

        // El libro cuenta la historia: carga inicial, conteo, reservas.
        var ledger = (await merchant.GetAsync($"/api/v1/inventory/{variant}/ledger")).GetProperty("items");
        Assert.True(ledger.GetArrayLength() >= 3);
        Assert.Contains(ledger.EnumerateArray(), m => m.GetProperty("reason").GetString() == "Conteo");
    }
    [Fact]
    public async Task Ajuste_con_stock_esperado_no_pisa_una_venta_del_medio()
    {
        var merchant = await Merchant.CreateAsync(factory, "inv-cas");
        var (_, variant) = await merchant.CreateProductAsync("Barra olímpica", stock: 5);

        // La pantalla cargó 5; mientras se editaba, el checkout reservó 2.
        Assert.True((await WithInventoryAsync(i => i.ReserveAsync(merchant.TenantId, variant, 2))).IsSuccess);

        // Guardar con lo que se vio (5) no pisa la venta: 409 con el stock real.
        var stale = await merchant.SendAsync(HttpMethod.Put, $"/api/v1/inventory/{variant}",
            new { available = 8, reason = "Edición de producto", expectedAvailable = 5 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var problem = await stale.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Stock.Changed", problem.GetProperty("title").GetString());
        Assert.Equal("El stock cambió mientras editabas: ahora hay 3. Revisalo y guardá de nuevo.",
            problem.GetProperty("detail").GetString());
        Assert.Equal(3, await merchant.AvailableAsync(variant));

        // Con el valor actual, el ajuste pasa y queda en el libro con su motivo.
        var ok = await merchant.PutAsync($"/api/v1/inventory/{variant}",
            new { available = 8, reason = "Edición de producto", expectedAvailable = 3 });
        Assert.Equal(8, ok.GetProperty("available").GetInt32());
        var ledger = (await merchant.GetAsync($"/api/v1/inventory/{variant}/ledger")).GetProperty("items");
        Assert.Contains(ledger.EnumerateArray(), m =>
            m.GetProperty("reason").GetString() == "Edición de producto" && m.GetProperty("quantity").GetInt32() == 5);

        // Variante sin fila de stock: esperar 0 es el alta inicial; esperar otra cosa, conflicto.
        var (_, fresh) = await merchant.CreateProductAsync("Disco 10kg", stock: 0);
        var created = await merchant.SendAsync(HttpMethod.Put, $"/api/v1/inventory/{fresh}",
            new { available = 4, reason = "Alta", expectedAvailable = 0 });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        Assert.Equal(4, await merchant.AvailableAsync(fresh));
    }
}
