using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Purchasing.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Proveedores y Compras hablan del mismo proveedor: la compra cargada con el
/// nombre escrito a mano queda atada a una ficha (la que ya existe con ese
/// nombre o una nueva), y "Traer de mis compras" ata las del histórico.
/// </summary>
[Collection("api")]
public sealed class SupplierLinkTests(ApiFactory factory)
{
    private const string Orders = "/api/v1/purchasing/purchase-orders";

    private static List<JsonElement> Items(JsonElement page) => page.GetProperty("items").EnumerateArray().ToList();

    [Fact]
    public async Task La_compra_con_el_proveedor_escrito_a_mano_queda_en_su_ficha()
    {
        var merchant = await Merchant.CreateAsync(factory, "sl1");
        var existing = await merchant.PostAsync("/api/v1/suppliers", new { name = "Textil Norte" });

        var first = await merchant.PostAsync(Orders, new { supplierName = "textil norte", currency = "ARS", exchangeRate = 1m });
        var second = await merchant.PostAsync(Orders, new { supplierName = "Plásticos del Sur", currency = "ARS", exchangeRate = 1m });

        Assert.Equal(existing.GetProperty("id").GetGuid(), first.GetProperty("supplierId").GetGuid());
        var suppliers = Items(await merchant.GetAsync("/api/v1/suppliers"));
        Assert.Equal(["Plásticos del Sur", "Textil Norte"], suppliers.Select(s => s.GetProperty("name").GetString()));
        var sur = suppliers.Single(s => s.GetProperty("name").GetString() == "Plásticos del Sur");
        Assert.Equal(second.GetProperty("supplierId").GetGuid(), sur.GetProperty("id").GetGuid());
        Assert.Equal(1, sur.GetProperty("purchaseCount").GetInt32());
    }

    [Fact]
    public async Task Traer_de_mis_compras_ata_el_historico_sin_duplicar_proveedores()
    {
        var merchant = await Merchant.CreateAsync(factory, "sl2");
        // Compras viejas, de antes de las fichas: solo el nombre.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
            foreach (var name in new[] { "Importadora Uno", "IMPORTADORA UNO", "Fundición Dos", "X" })
                db.PurchaseOrders.Add(PurchaseOrder.Create(merchant.TenantId, name).Value);
            await db.SaveChangesAsync();
        }

        var result = await merchant.PostAsync("/api/v1/suppliers/sync-from-purchases", new { });
        Assert.Equal(2, result.GetProperty("created").GetInt32());
        // "X" no alcanza para una ficha (mínimo dos letras): queda como estaba.
        Assert.Equal(3, result.GetProperty("linked").GetInt32());

        var suppliers = Items(await merchant.GetAsync("/api/v1/suppliers"));
        var uno = suppliers.Single(s => s.GetProperty("name").GetString() == "Importadora Uno");
        Assert.Equal(2, uno.GetProperty("purchaseCount").GetInt32());

        // Correrlo de nuevo no hace nada.
        var again = await merchant.PostAsync("/api/v1/suppliers/sync-from-purchases", new { });
        Assert.Equal(0, again.GetProperty("created").GetInt32());
        Assert.Equal(0, again.GetProperty("linked").GetInt32());
    }
}
