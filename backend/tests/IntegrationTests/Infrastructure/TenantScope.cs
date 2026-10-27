using Api.Middleware;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Un scope con la tienda fijada, como el de un request con su header o el de un
/// worker que procesa algo de esa tienda. Los filtros por tienda de los
/// DbContext están cerrados por defecto: un scope sin tienda no ve filas de
/// ninguna (para eso, IgnoreQueryFilters()).
/// </summary>
public static class TenantScope
{
    public static AsyncServiceScope CreateTenantScope(this IServiceProvider services, Guid tenantId)
    {
        var scope = services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(tenantId));
        return scope;
    }
}
