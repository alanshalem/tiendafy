using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Exporta las respuestas REALES de la API (la tienda sembrada con la demo)
/// a un archivo de fixtures que usan los tests de componentes del admin y del
/// storefront. Así cada pantalla se prueba con datos con la forma exacta de
/// producción, no con un mock escrito a mano que se desactualiza en silencio.
///
/// <para>
/// Opt-in: solo corre con <c>TIENDAFY_EXPORT_FIXTURES=&lt;ruta del archivo&gt;</c>
/// (lo hace <c>pnpm fixtures:api</c>). Sin la variable no hace nada. Las claves
/// van normalizadas: un GUID es <c>:id</c>, un id numérico largo <c>:n</c> y
/// un slug <c>:slug</c>; los tests buscan la ruta pedida con la misma regla.
/// Si un listado cambia de forma con <c>?offset</c> (paginado con total), esa
/// variante va además con la clave <c>ruta#paged</c>.
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class ApiFixturesExport
{
    private readonly ApiFactory _factory;

    public ApiFixturesExport(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Exportar_respuestas_reales()
    {
        var target = Environment.GetEnvironmentVariable("TIENDAFY_EXPORT_FIXTURES");
        if (string.IsNullOrWhiteSpace(target)) return;

        var seeded = await SeededStore.GetSeededAsync(_factory);
        var store = seeded.Store;
        var routes = new SortedDictionary<string, JsonNode?>(StringComparer.Ordinal);

        await ReadyToSellAsync(store);

        // Primero el comprador (su compra mueve el stock sembrado): así todo lo
        // que exporta el dueño después ya refleja esa venta.
        var (shopper, conversationId) = await ShopperWithHistoryAsync(store, seeded.Ids);

        foreach (var pattern in Patterns())
        {
            // Lo del comprador (/shop/…) se pide con su sesión.
            if (pattern.StartsWith("/api/v1/shop/", StringComparison.Ordinal))
            {
                var shopPath = Parameter().Replace(pattern, conversationId.ToString());
                var shopRes = await shopper.SendAsync(HttpMethod.Get, shopPath);
                if (shopRes.IsSuccessStatusCode && shopRes.Content.Headers.ContentType?.MediaType == "application/json")
                    routes[Normalize(shopPath)] = JsonNode.Parse(await shopRes.Content.ReadAsStringAsync());
                continue;
            }

            var path = Concrete(pattern, seeded.Ids);
            if (path is null) continue;

            var res = await store.SendAsync(HttpMethod.Get, path + Query(pattern, seeded.Ids));
            if (!res.IsSuccessStatusCode) continue;
            if (res.Content.Headers.ContentType?.MediaType != "application/json") continue;

            var body = JsonNode.Parse(await res.Content.ReadAsStringAsync());
            routes[Normalize(path)] = body;

            // Algunos listados cambian de forma con ?offset (paginado con total)
            // respecto del modo cursor: se exporta también esa variante.
            if (body is JsonObject plain && !path.Contains('?'))
            {
                var paged = await store.SendAsync(HttpMethod.Get, path + "?offset=0&limit=25");
                if (paged.IsSuccessStatusCode && paged.Content.Headers.ContentType?.MediaType == "application/json"
                    && JsonNode.Parse(await paged.Content.ReadAsStringAsync()) is JsonObject pagedBody
                    && !pagedBody.Select(p => p.Key).Order().SequenceEqual(plain.Select(p => p.Key).Order()))
                {
                    routes[Normalize(path) + "#paged"] = pagedBody;
                }
            }
        }

        // Los favoritos de la cuenta no tienen GET: la tienda los lee con el
        // merge (con la lista del navegador), que es una escritura y el
        // recorrido de arriba no la ve. Con la lista vacía no agrega nada.
        routes["/api/v1/shop/favorites/merge"] = JsonNode.Parse((await shopper.ExpectJsonAsync(
            HttpMethod.Post, "/api/v1/shop/favorites/merge", new { productIds = Array.Empty<string>() })).GetRawText());

        var document = new JsonObject
        {
            ["_comment"] = "Generado por ApiFixturesExport (pnpm fixtures:api). No editar a mano.",
            ["tenantId"] = store.TenantId.ToString(),
            ["routes"] = new JsonObject(routes.Select(kv => KeyValuePair.Create(kv.Key, kv.Value))),
        };
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(target))!);
        await File.WriteAllTextAsync(target, document.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n");
        Assert.True(routes.Count > 80, $"solo {routes.Count} rutas exportadas");
    }

    /// <summary>
    /// Lo que tiene configurado una tienda que ya vende, como las de la
    /// importadora: ARCA lista para facturar (emisor, certificado y punto de
    /// venta) y transferencia con descuento más efectivo al retirar. Sin esto
    /// las fixtures son las de una tienda a medio armar: el panel ofrece
    /// "Configurá la facturación" en cada venta y la tienda no deja comprar.
    ///
    /// <para>
    /// Mercado Pago y Payway quedan sin conectar a propósito: los tests de
    /// medios de pago arrancan de "sin conectar" y los del checkout dicen con
    /// qué pasarela cobran.
    /// </para>
    /// </summary>
    private async Task ReadyToSellAsync(Merchant store)
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<Identity.Infrastructure.AppUser>>();
            var user = await users.FindByEmailAsync(store.Email);
            if (user is not null && !user.IsSuperAdmin)
            {
                user.IsSuperAdmin = true;
                await users.UpdateAsync(user);
            }
        }
        _ = new FakeArca(_factory.ExternalHttp);
        await store.ConfigureFiscalAsync();
        await store.PutAsync("/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 10,
            bankName = "Banco Nación",
            accountHolder = "Importadora Seed SRL",
            holderTaxId = "30-71234567-8",
            cbu = "0110599520000012345678",
            alias = "SEED.TIENDA.PAGOS",
            instructions = "Mandanos el comprobante por WhatsApp.",
            holdHours = 48,
            cashOnPickupEnabled = true,
            installmentsMax = 0,
            installmentsNote = (string?)null,
        });
    }

    /// <summary>
    /// Un comprador con cuenta, una compra pagada de un producto sembrado, un
    /// favorito y el chat posventa de esa compra con un mensaje.
    /// </summary>
    private static async Task<(Shopper Shopper, Guid ConversationId)> ShopperWithHistoryAsync(
        Merchant store, IReadOnlyDictionary<string, string> ids)
    {
        const string email = "comprador@demo.local";
        var shopper = new Shopper(store);
        await shopper.RegisterVerifiedAsync(email, "Comprador Demo");

        var order = await store.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = ids["variant"], quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = email,
            buyerName = "Comprador Demo",
        });
        await shopper.ExpectOkAsync(HttpMethod.Put, $"/api/v1/shop/favorites/{ids["product"]}");

        var conversation = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/support/conversations",
            new { orderId = order.GetProperty("id").GetGuid() });
        var conversationId = conversation.GetProperty("id").GetGuid();
        await shopper.ExpectOkAsync(HttpMethod.Post, $"/api/v1/shop/support/conversations/{conversationId}/messages",
            new { body = "¿Cuándo llega mi pedido?" });
        return (shopper, conversationId);
    }

    /// <summary>La misma normalización que hacen los tests del frontend.</summary>
    public static string Normalize(string path)
    {
        var segments = path.Split('?')[0].TrimEnd('/').Split('/');
        for (var i = 0; i < segments.Length; i++)
        {
            if (Guid.TryParse(segments[i], out _)) segments[i] = ":id";
            else if (LongId().IsMatch(segments[i])) segments[i] = ":n";
            else if (i > 0 && segments[i - 1] == "by-slug") segments[i] = ":slug";
        }
        return string.Join('/', segments);
    }

    private IEnumerable<string> Patterns() =>
        _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("GET") == true)
            .Select(e => "/" + (e.RoutePattern.RawText ?? "").TrimStart('/').TrimEnd('/'))
            .Where(p => p.StartsWith("/api/v1/", StringComparison.Ordinal) && !p.Contains("/dev/") && !p.Contains("oauth") && !p.Contains("/callback"))
            .Distinct()
            .Order();

    /// <summary>El patrón con datos de la tienda sembrada, o null si algún parámetro no se resuelve.</summary>
    private static string? Concrete(string pattern, IReadOnlyDictionary<string, string> ids)
    {
        var segments = pattern.Split('/');
        for (var i = 0; i < segments.Length; i++)
        {
            var m = Parameter().Match(segments[i]);
            if (!m.Success) continue;
            var name = m.Groups[1].Value.Split(':')[0].TrimEnd('?').ToLowerInvariant();
            var previous = i > 0 ? segments[i - 1] : "";
            var key = pattern.Contains("/pages/by-slug/") ? "pageSlug"
                : name switch
                {
                    "orderid" => "order",
                    "variantid" => "variant",
                    "packid" => "meliPack",
                    "productid" => "product",
                    _ => previous switch
                    {
                        "orders" => "order",
                        "products" => "product",
                        "campaigns" => "campaign",
                        "purchase-orders" => "purchaseOrder",
                        "quotes" => "quote",
                        "suppliers" => "supplier",
                        "price-lists" => "priceList",
                        "tenants" => "tenant",
                        "conversations" => "conversation",
                        "inventory" => "variant",
                        "by-slug" => "productSlug",
                        "by-code" => "sku",
                        _ => null,
                    },
                };
            if (key is null || !ids.TryGetValue(key, out var value)) return null;
            segments[i] = value;
        }
        return string.Join('/', segments);
    }

    private static string Query(string pattern, IReadOnlyDictionary<string, string> ids) => pattern switch
    {
        // El cliente sembrado tiene una venta en cuenta corriente con un cobro parcial.
        "/api/v1/finance/ledger" or "/api/v1/finance/ledger/pending" => "?partyKind=customer&partyId=" + ids["customer"],
        // El repreciado del carrito: sin ids responde una lista vacía, que no muestra la forma.
        "/api/v1/products/variants" => "?ids=" + ids["variant"],
        _ => "",
    };

    [GeneratedRegex(@"\{([^}]+)\}")]
    private static partial Regex Parameter();

    [GeneratedRegex(@"^\d{6,}$")]
    private static partial Regex LongId();
}
