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

        foreach (var pattern in Patterns())
        {
            var path = Concrete(pattern, seeded.Ids);
            if (path is null) continue;

            var res = await store.SendAsync(HttpMethod.Get, path + Query(pattern));
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

    private static string Query(string pattern) => pattern switch
    {
        "/api/v1/finance/ledger" or "/api/v1/finance/ledger/pending" => "?partyKind=customer&partyId=" + Guid.Empty,
        _ => "",
    };

    [GeneratedRegex(@"\{([^}]+)\}")]
    private static partial Regex Parameter();

    [GeneratedRegex(@"^\d{6,}$")]
    private static partial Regex LongId();
}
