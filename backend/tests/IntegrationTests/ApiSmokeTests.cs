using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Smoke de la API entera: TODAS las rutas GET, descubiertas solas, contra
/// una tienda con datos de demo. Ninguna puede responder 500.
///
/// <para>
/// No prueba que cada pantalla muestre lo correcto —eso es de los tests de
/// cada área—, prueba que ninguna explota. Un endpoint nuevo entra solo, sin
/// acordarse de escribirle un test: es la red para lo que nadie probó a mano.
/// Los parámetros de ruta van con valores que no existen (Guid vacío, "x"):
/// un 404 o un 400 está bien, un 500 no. Y las fichas (<c>/algo/{id}</c>)
/// se piden además con un id REAL, sacado del listado de al lado, para que
/// el detalle con datos también pase.
/// </para>
///
/// <para>
/// 501 no cuenta como falla: es la respuesta deliberada de "esta integración
/// no está configurada" (login con Google sin credenciales, por ejemplo).
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class ApiSmokeTests
{
    private readonly ApiFactory _factory;

    public ApiSmokeTests(ApiFactory factory) => _factory = factory;

    /// <summary>
    /// Rutas que no se pueden pegar a ciegas, cada una con su motivo. Agregar
    /// acá es la excepción: lo normal es arreglar la ruta.
    /// </summary>
    private static readonly Dictionary<string, string> Skipped = new()
    {
        ["/health"] = "la cubre el healthcheck de infraestructura",
    };

    [Fact]
    public async Task Ninguna_ruta_GET_responde_500_al_duenio()
    {
        var store = await SeededStore.GetAsync(_factory);

        var failures = new List<string>();
        foreach (var path in GetRoutes())
        {
            var res = await store.SendAsync(HttpMethod.Get, path);
            if (IsServerError(res))
                failures.Add($"{(int)res.StatusCode} GET {path}: {Clip(await res.Content.ReadAsStringAsync())}");
        }

        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
    }

    [Fact]
    public async Task Ni_con_datos_reales()
    {
        // La misma barrida, pero cada {parámetro} con algo que EXISTE en la
        // tienda: la orden, el producto, el presupuesto… Es lo que recorre el
        // detalle de verdad, con datos, en vez de cortar en el 404.
        var seeded = await SeededStore.GetSeededAsync(_factory);

        var failures = new List<string>();
        var visited = 0;
        foreach (var pattern in RoutePatterns().Where(p => p.Contains('{')).Order())
        {
            var path = FillReal(pattern, seeded.Ids);
            if (path is null) continue;
            path += RequiredQuery.GetValueOrDefault(pattern, "");

            var res = await seeded.Store.SendAsync(HttpMethod.Get, path);
            visited++;
            if (IsServerError(res))
                failures.Add($"{(int)res.StatusCode} GET {path}: {Clip(await res.Content.ReadAsStringAsync())}");
        }

        // Y las que piden parámetros de query obligatorios, con valores válidos.
        foreach (var (pattern, query) in RequiredQuery.Where(kv => !kv.Key.Contains('{')))
        {
            var path = pattern + query.Replace("{variant}", seeded.Ids["variant"]).Replace("{customer}", seeded.Ids["customer"]);
            var res = await seeded.Store.SendAsync(HttpMethod.Get, path);
            visited++;
            if (IsServerError(res) || !res.IsSuccessStatusCode)
                failures.Add($"{(int)res.StatusCode} GET {path}: {Clip(await res.Content.ReadAsStringAsync())}");
        }

        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
        // Si el resolvedor deja de reconocer los parámetros, esto no probaría nada.
        Assert.True(visited >= 30, $"solo {visited} rutas con datos reales");
    }

    [Fact]
    public async Task Ninguna_ruta_GET_responde_500_a_un_anonimo()
    {
        // El comprador de la tienda y los bots: sin sesión, con o sin tienda.
        var store = await SeededStore.GetAsync(_factory);
        var anonymous = store.Anonymous();

        var failures = new List<string>();
        foreach (var path in GetRoutes())
        {
            var conTienda = await store.SendAsync(anonymous, HttpMethod.Get, path);
            var sinTienda = await anonymous.GetAsync(path);
            foreach (var (res, how) in new[] { (conTienda, "con tienda"), (sinTienda, "sin tienda") })
                if (IsServerError(res))
                    failures.Add($"{(int)res.StatusCode} GET {path} ({how}): {Clip(await res.Content.ReadAsStringAsync())}");
        }

        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
    }

    [Fact]
    public void Descubre_las_rutas()
    {
        // Si el descubrimiento se rompe, los dos tests de arriba pasarían sin
        // probar nada. Hoy son unas ciento cincuenta.
        Assert.True(GetRoutes().Count > 120, $"se descubrieron {GetRoutes().Count} rutas GET");
    }

    // ---------------------------------------------------------------- rutas

    /// <summary>Los patrones de todas las rutas GET, tal cual se registraron.</summary>
    private HashSet<string> RoutePatterns() =>
        [.. _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("GET") == true)
            .Select(e => "/" + (e.RoutePattern.RawText ?? "").TrimStart('/').TrimEnd('/'))
            .Where(p => !Skipped.ContainsKey(p) && !p.Contains("/dev/"))];

    /// <summary>Las rutas GET con sus parámetros completados, listas para pedir.</summary>
    private List<string> GetRoutes() => [.. RoutePatterns().Select(Fill).Distinct().Order()];

    /// <summary>
    /// Qué dato de la tienda sembrada va en cada parámetro, según el recurso
    /// que lo precede (<c>/orders/{id}</c> es una orden) o su nombre
    /// (<c>{orderId}</c>). Los que no se resuelven quedan fuera de este pase:
    /// los cubre igual la barrida con valores que no existen.
    /// </summary>
    private static readonly Dictionary<string, string> ByResource = new()
    {
        ["orders"] = "order",
        ["products"] = "product",
        ["campaigns"] = "campaign",
        ["purchase-orders"] = "purchaseOrder",
        ["quotes"] = "quote",
        ["suppliers"] = "supplier",
        ["price-lists"] = "priceList",
        ["tenants"] = "tenant",
        ["conversations"] = "conversation",
        ["coupons"] = "coupon",
        ["customers"] = "customer",
        ["pages"] = "page",
        ["categories"] = "category",
        ["accounts"] = "account",
        ["methods"] = "shippingMethod",
        ["messages"] = "contactMessage",
        ["inventory"] = "variant",
        ["by-slug"] = "productSlug",
        ["by-code"] = "sku",
        ["packs"] = "meliPack",
    };

    private static readonly Dictionary<string, string> ByName = new()
    {
        ["orderid"] = "order",
        ["variantid"] = "variant",
        ["packid"] = "meliPack",
        ["productid"] = "product",
    };

    /// <summary>Parámetros de query obligatorios, con valores válidos.</summary>
    private static readonly Dictionary<string, string> RequiredQuery = new()
    {
        ["/api/v1/inventory"] = "?variantIds={variant}",
        ["/api/v1/products/labels"] = "?variantIds={variant}",
        ["/api/v1/fiscal/documents/export"] = "?year=2026&month=10",
        ["/api/v1/purchasing/vat-book"] = "?year=2026&month=10",
        ["/api/v1/finance/ledger"] = "?partyKind=customer&partyId={customer}",
        ["/api/v1/finance/ledger/pending"] = "?partyKind=customer&partyId={customer}",
        ["/api/v1/quotes/prices"] = "?customerId={customer}&variantIds={variant}",
    };

    private static string? FillReal(string pattern, IReadOnlyDictionary<string, string> ids)
    {
        var segments = pattern.Split('/');
        for (var i = 0; i < segments.Length; i++)
        {
            var m = Parameter().Match(segments[i]);
            if (!m.Success) continue;
            var name = m.Groups[1].Value.Split(':')[0].TrimEnd('?').ToLowerInvariant();
            var previous = i > 0 ? segments[i - 1] : "";

            // by-slug es de productos salvo en páginas de contenido.
            var key = pattern.Contains("/pages/by-slug/") ? "pageSlug"
                : ByName.GetValueOrDefault(name) ?? ByResource.GetValueOrDefault(previous);
            if (key is null || !ids.TryGetValue(key, out var value)) return null;
            segments[i] = value;
        }
        return string.Join('/', segments);
    }

    private static bool IsServerError(HttpResponseMessage res) =>
        (int)res.StatusCode >= 500 && res.StatusCode != HttpStatusCode.NotImplemented;

    /// <summary>Reemplaza cada {parámetro} por un valor que no existe pero tiene el tipo correcto.</summary>
    private static string Fill(string pattern) => Parameter().Replace(pattern, m =>
    {
        var spec = m.Groups[1].Value.ToLowerInvariant();
        if (spec.Contains(":guid") || spec.EndsWith("id")) return Guid.Empty.ToString();
        if (spec.Contains(":int") || spec.Contains(":long")) return "0";
        return "x";
    });

    [GeneratedRegex(@"\{([^}]+)\}")]
    private static partial Regex Parameter();

    private static string Clip(string s) => s.Length <= 300 ? s : s[..300] + "…";
}
