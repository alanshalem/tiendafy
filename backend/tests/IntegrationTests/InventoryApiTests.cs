using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La API de inventario de punta a punta: ubicación en el depósito, ajuste
/// manual (nunca negativo), reservas —tomar, confirmar, liberar, y no más de
/// lo que hay— y el libro de movimientos que lo explica todo.
/// </summary>
[Collection("api")]
public sealed class InventoryApiTests(ApiFactory factory)
{
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
        var reservation = await merchant.PostAsync("/api/v1/inventory/reservations", new { variantId = variant, quantity = 2 });
        Assert.Equal("ACTIVE", reservation.GetProperty("status").GetString());
        Assert.Equal(4, await merchant.AvailableAsync(variant));
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inventory/reservations/{reservation.GetProperty("id").GetGuid()}/confirm");

        var released = await merchant.PostAsync("/api/v1/inventory/reservations", new { variantId = variant, quantity = 1 });
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inventory/reservations/{released.GetProperty("id").GetGuid()}/release");
        Assert.Equal(4, await merchant.AvailableAsync(variant));

        // No se reserva más de lo que hay, ni se confirma/libera lo que no existe.
        Assert.False((await merchant.SendAsync(HttpMethod.Post, "/api/v1/inventory/reservations",
            new { variantId = variant, quantity = 50 })).IsSuccessStatusCode);
        Assert.False((await merchant.SendAsync(HttpMethod.Post, $"/api/v1/inventory/reservations/{Guid.NewGuid()}/confirm")).IsSuccessStatusCode);
        Assert.False((await merchant.SendAsync(HttpMethod.Post, $"/api/v1/inventory/reservations/{Guid.NewGuid()}/release")).IsSuccessStatusCode);

        // El libro cuenta la historia: carga inicial, conteo, reservas.
        var ledger = (await merchant.GetAsync($"/api/v1/inventory/{variant}/ledger")).GetProperty("items");
        Assert.True(ledger.GetArrayLength() >= 3);
        Assert.Contains(ledger.EnumerateArray(), m => m.GetProperty("reason").GetString() == "Conteo");
    }
}
