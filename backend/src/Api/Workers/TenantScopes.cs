using Api.Middleware;
using SharedKernel.Common;

namespace Api.Workers;

/// <summary>
/// Un scope de worker con la tienda fijada. Los filtros por tienda de los
/// DbContext están cerrados por defecto: sin tienda en el scope no devuelven
/// filas, así que lo que un worker hace para UNA tienda (importar su catálogo,
/// mandar sus avisos) va en un scope de esa tienda. Lo que recorre varias lo
/// pide explícito con IgnoreQueryFilters().
/// </summary>
public static class TenantScopes
{
    public static IServiceScope CreateTenantScope(this IServiceScopeFactory factory, TenantId tenantId)
    {
        var scope = factory.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(tenantId);
        return scope;
    }
}
