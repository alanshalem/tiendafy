using System.Diagnostics;
using System.Net;

namespace IntegrationTests;

/// <summary>
/// Performance que se puede afirmar en cada build, sin un ambiente de carga:
///
/// <list type="bullet">
/// <item>Las lecturas de listados hacen una cantidad de consultas que NO crece
/// con los datos (un N+1 —una consulta por fila— pasa los tests funcionales y
/// se nota recién con el catálogo de un cliente grande).</item>
/// <item>El catálogo público aguanta pedidos concurrentes sin errores y dentro
/// de un presupuesto de latencia holgado (es en proceso, contra Postgres real:
/// el número absoluto no es el de producción, pero una regresión de órdenes de
/// magnitud sí se ve).</item>
/// </list>
///
/// La carga contra el stack levantado (latencias reales, rate limiting) la
/// mide scripts/load-test.mjs.
/// </summary>
[Collection("api")]
public sealed class PerformanceTests
{
    private readonly ApiFactory _factory;

    public PerformanceTests(ApiFactory factory) => _factory = factory;

    /// <summary>Consultas de diferencia que no son N+1 (cachés que vencen entre mediciones).</summary>
    private const int JitterQueries = 1;

    /// <summary>Lo que se mide: cada listado, con su forma de pedirlo.</summary>
    private static readonly string[] Listings =
    [
        "/api/v1/products?limit=50",
        "/api/v1/products?limit=25&offset=0",
        "/api/v1/products/search?pageSize=24",
        "/api/v1/orders?limit=50",
        "/api/v1/orders?limit=25&offset=0",
        "/api/v1/customers?limit=50",
        "/api/v1/inventory/summary?lowStockThreshold=5",
        "/api/v1/finance/balances?partyKind=customer",
        "/api/v1/stats/products/top",
    ];

    [Fact]
    public async Task Los_listados_no_hacen_una_consulta_por_fila()
    {
        var store = await Merchant.CreateAsync(_factory, "perf");
        await AddSalesAsync(store, 2);
        var few = await CountAllAsync(store);

        await AddSalesAsync(store, 10);
        var many = await CountAllAsync(store);

        foreach (var path in Listings)
        {
            Assert.True(few[path] > 0, $"{path}: no se contó ninguna consulta (¿el contador escucha a EF?)");
            // Un N+1 suma una consulta por fila: 10 ventas más son ~10 consultas más.
            // Se tolera una suelta (un caché que vence entre las dos mediciones), que
            // en CI hacía fallar el test con 9 contra 10 sin que nada creciera con los datos.
            Assert.True(many[path] <= few[path] + JitterQueries,
                $"{path}: {few[path]} consultas con 2 ventas y {many[path]} con 12 — crece con los datos (N+1)");
        }
    }

    [Fact]
    public async Task El_catalogo_publico_aguanta_pedidos_concurrentes()
    {
        var store = await SeededStore.GetAsync(_factory);
        var shopper = new Shopper(store);
        const int total = 200;
        const int concurrency = 20;
        var paths = new[]
        {
            "/api/v1/products/search?pageSize=24",
            "/api/v1/products/search?q=barra",
            "/api/v1/theme",
            "/api/v1/categories",
            "/api/v1/checkout-settings",
            "/api/v1/shipping/methods",
        };

        // Calentar: la primera vuelta compila consultas y llena caches, y una
        // ráfaga concurrente abre las conexiones del pool. Medido: abrir ~20
        // conexiones en frío cuesta segundos (en Docker Desktop, ~380 ms cada
        // una) y eso es arranque, no el endpoint.
        foreach (var path in paths) await shopper.ExpectOkAsync(HttpMethod.Get, path);
        await Task.WhenAll(Enumerable.Range(0, concurrency).Select(_ => shopper.SendAsync(HttpMethod.Get, paths[0])));

        var latencies = new List<double>(total);
        var failures = new List<string>();
        using var gate = new SemaphoreSlim(concurrency);
        var tasks = Enumerable.Range(0, total).Select(async i =>
        {
            await gate.WaitAsync();
            try
            {
                var path = paths[i % paths.Length];
                var watch = Stopwatch.StartNew();
                var res = await shopper.SendAsync(HttpMethod.Get, path);
                watch.Stop();
                lock (latencies)
                {
                    latencies.Add(watch.Elapsed.TotalMilliseconds);
                    if (res.StatusCode != HttpStatusCode.OK) failures.Add($"{path} → {(int)res.StatusCode}");
                }
            }
            finally
            {
                gate.Release();
            }
        });
        await Task.WhenAll(tasks);

        Assert.Empty(failures);
        latencies.Sort();
        var p95 = latencies[(int)Math.Ceiling(latencies.Count * 0.95) - 1];
        Assert.True(p95 < 1_000, $"p95 = {p95:F0} ms con {concurrency} pedidos concurrentes");
    }

    private async Task<Dictionary<string, int>> CountAllAsync(Merchant store)
    {
        var counts = new Dictionary<string, int>();
        foreach (var path in Listings)
        {
            await store.ExpectOkAsync(HttpMethod.Get, path); // calentar caches del pedido
            counts[path] = await SqlCommands.CountAsync(() => store.ExpectOkAsync(HttpMethod.Get, path));
        }
        return counts;
    }

    /// <summary>Ventas (cada una con su producto y su cliente): crecen los tres listados.</summary>
    private static async Task AddSalesAsync(Merchant store, int count)
    {
        for (var i = 0; i < count; i++)
            await store.CreateSaleAsync(buyerEmail: $"perf-{Guid.NewGuid():N}@mail.com");
    }
}
