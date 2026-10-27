using System.Reflection;
using Api.Middleware;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// El filtro por tienda de los DbContext está cerrado por defecto: sin tienda en
/// el scope, las entidades con TenantId no devuelven filas.
///
/// <para>
/// Antes era al revés: sin tienda el filtro se apagaba y la consulta veía las
/// filas de todas las tiendas. No era explotable (los endpoints sin tienda van
/// por id o con su propio Where), pero un endpoint nuevo sin RequireTenant ni
/// Where(TenantId) habría leído los datos de todas. Lo que de verdad recorre
/// varias tiendas (workers, plataforma, backfills) lo pide explícito con
/// IgnoreQueryFilters() o fija la tienda en el scope.
/// </para>
/// </summary>
[Collection("api")]
public sealed class TenantFilterFailClosedTests(ApiFactory factory)
{
    [Fact]
    public async Task Sin_tienda_en_el_scope_ninguna_entidad_con_tienda_devuelve_filas()
    {
        var merchant = await Merchant.CreateAsync(factory, "fclosed");
        await merchant.CreateProductAsync($"Producto {merchant.Subdomain}");

        await using var scope = factory.Services.CreateAsyncScope();
        var checkedEntities = 0;
        foreach (var contextType in ContextTypes())
        {
            // Los que no se registran (bases de Identity) no tienen entidades por tienda.
            if (scope.ServiceProvider.GetService(contextType) is not DbContext context) continue;
            foreach (var entity in context.Model.GetEntityTypes()
                         .Where(e => !e.IsOwned() && e.BaseType is null && e.GetDeclaredQueryFilters().Count > 0
                             && e.GetProperties().Any(p => p.Name == "TenantId")))
            {
                Assert.False(await AnyAsync(context, entity.ClrType),
                    $"{contextType.Name}.{entity.ClrType.Name} devuelve filas sin tienda en el scope.");
                checkedEntities++;
            }
        }
        Assert.True(checkedEntities > 40, $"Se esperaban decenas de entidades filtradas; se revisaron {checkedEntities}.");

        // Las filas están: con IgnoreQueryFilters (lo explícito) se ven.
        var catalog = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        var tenantId = TenantId.From(merchant.TenantId);
        Assert.True(await catalog.Products.IgnoreQueryFilters().AnyAsync(p => p.TenantId == tenantId));
    }

    [Fact]
    public async Task Con_la_tienda_fijada_en_el_scope_se_ve_solo_lo_suyo_aunque_se_fije_despues()
    {
        var a = await Merchant.CreateAsync(factory, "fca");
        var b = await Merchant.CreateAsync(factory, "fcb");
        await a.CreateProductAsync($"Producto {a.Subdomain}");
        await b.CreateProductAsync($"Producto {b.Subdomain}");

        await using var scope = factory.Services.CreateAsyncScope();
        // El contexto se resuelve ANTES de fijar la tienda (como en un worker
        // que la conoce recién al leer el ítem): el filtro la lee en cada consulta.
        var catalog = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        Assert.False(await catalog.Products.AnyAsync());

        var tenantA = TenantId.From(a.TenantId);
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(tenantA);
        var seen = await catalog.Products.AsNoTracking().Select(p => p.TenantId).Distinct().ToListAsync();
        Assert.Equal([tenantA], seen);
    }

    private static IEnumerable<Type> ContextTypes()
    {
        var api = typeof(Api.Workers.InboxDrain).Assembly;
        return api.GetReferencedAssemblies()
            .Select(Assembly.Load)
            .Append(api)
            .SelectMany(a => a.GetTypes())
            .Where(t => t is { IsAbstract: false, IsGenericTypeDefinition: false } && t.IsSubclassOf(typeof(DbContext)))
            .Distinct()
            .OrderBy(t => t.Name);
    }

    private static readonly MethodInfo AnyOf = typeof(TenantFilterFailClosedTests)
        .GetMethod(nameof(AnyGenericAsync), BindingFlags.NonPublic | BindingFlags.Static)!;

    private static Task<bool> AnyAsync(DbContext context, Type entity) =>
        (Task<bool>)AnyOf.MakeGenericMethod(entity).Invoke(null, [context])!;

    private static Task<bool> AnyGenericAsync<T>(DbContext context) where T : class =>
        context.Set<T>().AnyAsync();
}
