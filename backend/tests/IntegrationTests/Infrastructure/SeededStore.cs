using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Una tienda con la operación de demo cargada: catálogo, ventas, compras,
/// campañas, chat posventa, Mercado Libre en modo demo… Lo que hace
/// <c>POST /dev/demo-seed</c> en el panel de desarrollo, más lo que la demo no
/// trae (categoría, proveedor, lista de precios, presupuesto, caja, envío).
///
/// <para>
/// Se siembra UNA vez por corrida y la comparten los tests que solo leen: el
/// smoke de rutas y los de cada pantalla. Sembrar cuesta segundos; hacerlo por
/// test multiplicaría la suite. Los tests que escriben usan su propio
/// <see cref="Merchant"/> para no pisarse.
/// </para>
/// </summary>
public static class SeededStore
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static Seeded? _seeded;

    /// <summary>Productos que se cargan antes de sembrar: la demo vende lo que hay.</summary>
    public static readonly string[] Products =
    [
        "Mancuerna hexagonal 10kg",
        "Barra olímpica 20kg",
        "Disco de goma 5kg",
        "Banco plano regulable",
        "Soga de saltar con rulemanes",
    ];

    /// <summary>La tienda sembrada y los ids de una muestra de cada cosa.</summary>
    public sealed record Seeded(Merchant Store, IReadOnlyDictionary<string, string> Ids);

    public static async Task<Merchant> GetAsync(ApiFactory factory) => (await GetSeededAsync(factory)).Store;

    public static async Task<Seeded> GetSeededAsync(ApiFactory factory)
    {
        await Gate.WaitAsync();
        try
        {
            return _seeded ??= await SeedAsync(factory);
        }
        finally
        {
            Gate.Release();
        }
    }

    private static async Task<Seeded> SeedAsync(ApiFactory factory)
    {
        var store = await Merchant.CreateAsync(factory, "seed");
        var ids = new Dictionary<string, string>();

        var category = await store.PostAsync("/api/v1/categories", new { name = "Musculación" });
        ids["category"] = Id(category);

        for (var i = 0; i < Products.Length; i++)
        {
            var (productId, variantId) = await store.CreateProductAsync(
                Products[i], priceMinor: (i + 1) * 25_000_00L, stock: 50, sku: $"SEED-{i + 1:00}");
            if (i == 0)
            {
                ids["product"] = productId.ToString();
                ids["variant"] = variantId.ToString();
                ids["sku"] = "SEED-01";
            }
        }
        // El primero, completo como lo deja un comercio: categoría, ficha técnica
        // y fotos. Sin esto las fixtures de los frontends nunca ejercitan esas ramas.
        await store.PutAsync($"/api/v1/products/{ids["product"]}/categories", new { categoryIds = new[] { ids["category"] } });
        var material = await store.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Material",
            type = "TEXT",
            categoryIds = new[] { ids["category"] },
            showOnProduct = true,
            filterable = true,
            sortOrder = 1,
        });
        var weight = await store.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Peso",
            type = "NUMBER",
            unit = "kg",
            showOnProduct = true,
            filterable = false,
            sortOrder = 2,
        });
        await store.PutAsync($"/api/v1/products/{ids["product"]}/specs", new
        {
            values = new[]
            {
                new { definitionId = Id(material), value = "Hierro fundido" },
                new { definitionId = Id(weight), value = "10" },
            },
        });
        foreach (var photo in new[] { "frente", "detalle" })
            await store.PostAsync($"/api/v1/products/{ids["product"]}/images",
                new { url = $"{ApiFactory.Storage}/tiendafy-media/seed/{photo}.jpg", altText = Products[0] });

        var product = await store.GetAsync($"/api/v1/products/{ids["product"]}");
        ids["productSlug"] = product.GetProperty("slug").GetString()!;

        await store.PostAsync("/api/v1/dev/demo-seed", new { });

        ids["supplier"] = Id(await store.PostAsync("/api/v1/suppliers",
            new { name = "Importadora del Sur", taxId = "30712345678", email = "ventas@sur.test" }));
        ids["priceList"] = Id(await store.PostAsync("/api/v1/price-lists",
            new { name = "Mayorista", currency = "ARS", adjustmentPercent = -20, rounding = "none" }));
        ids["account"] = Id(await store.PostAsync("/api/v1/finance/accounts",
            new { name = "Caja", kind = "cash", currency = "ARS", openingBalanceMinor = 100_000L }));
        ids["shippingMethod"] = Id(await store.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Retiro en el local", kind = "pickup", price = 0m, pickupAddress = "Av. Siempreviva 742" }));
        ids["quote"] = Id(await store.PostAsync("/api/v1/quotes", new
        {
            customerName = "Gimnasio del Centro",
            currency = "ARS",
            validUntilUtc = DateTime.UtcNow.Date.AddDays(10),
            items = new[] { new { variantId = ids["variant"], quantity = 2, unitPriceMinor = 25_000_00L } },
        }));

        // Lo que sembró la demo: el primero de cada listado.
        ids["order"] = FirstId(await store.GetAsync("/api/v1/orders"));
        ids["customer"] = FirstId(await store.GetAsync("/api/v1/customers"));
        ids["campaign"] = FirstId(await store.GetAsync("/api/v1/admin/campaigns"));
        ids["purchaseOrder"] = FirstId(await store.GetAsync("/api/v1/purchasing/purchase-orders"));
        ids["conversation"] = FirstId(await store.GetAsync("/api/v1/support/conversations"));
        ids["coupon"] = FirstId(await store.GetAsync("/api/v1/coupons"));

        // Finanzas con movimiento: un gasto de caja, una venta en cuenta
        // corriente al primer cliente con un cobro parcial, y una deuda con el
        // proveedor. Sin esto Tesorería y Cuentas corrientes solo muestran vacíos.
        await store.PostAsync("/api/v1/finance/movements",
            new { accountId = ids["account"], kind = "out", amountMinor = 30_000L, concept = "Flete" });
        await store.PostAsync("/api/v1/finance/ledger/adjustments", new
        {
            partyKind = "customer",
            partyId = ids["customer"],
            kind = "debit",
            amountMinor = 200_000L,
            currency = "ARS",
            label = "Factura A 0001-00000001",
        });
        var pendingInvoice = FirstId(await store.GetAsync(
            $"/api/v1/finance/ledger/pending?partyKind=customer&partyId={ids["customer"]}"));
        await store.PostAsync("/api/v1/finance/receipts", new
        {
            kind = "collection",
            partyKind = "customer",
            partyId = ids["customer"],
            partyName = "Cliente sembrado",
            payments = new[] { new { accountId = ids["account"], amountMinor = 80_000L } },
            allocations = new[] { new { ledgerEntryId = pendingInvoice, amountMinor = 80_000L } },
        });
        await store.PostAsync("/api/v1/finance/ledger/adjustments", new
        {
            partyKind = "supplier",
            partyId = ids["supplier"],
            kind = "credit",
            amountMinor = 500_000L,
            currency = "ARS",
            label = "Factura proveedor 0003-00000120",
        });
        ids["contactMessage"] = FirstId(await store.GetAsync("/api/v1/contact/messages"));
        var pages = await store.GetAsync("/api/v1/pages");
        ids["page"] = FirstId(pages);
        ids["pageSlug"] = pages.GetProperty("items")[0].GetProperty("slug").GetString()!;
        var meli = await store.GetAsync("/api/v1/admin/meli/orders");
        ids["meliPack"] = meli.GetProperty("items")[0].GetProperty("packId").ToString();
        ids["tenant"] = store.TenantId.ToString();

        return new Seeded(store, ids);
    }

    private static string Id(JsonElement body) => body.GetProperty("id").ToString();

    private static string FirstId(JsonElement list) => list.GetProperty("items")[0].GetProperty("id").ToString();
}
