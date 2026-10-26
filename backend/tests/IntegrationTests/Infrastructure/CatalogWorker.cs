using Ai.Infrastructure;
using Api.Ai.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Una pasada del worker de fichas. La pasada es de TODAS las tiendas (en producción es lo que se quiere), y en los tests
/// quedan trabajos activos de otros tests que gastarían las respuestas guionizadas de este: antes de cada pasada se cancelan.
/// </summary>
public static class CatalogWorker
{
    public static async Task RunOnceAsync(ApiFactory factory, Guid tenantId)
    {
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            await db.CatalogJobs.IgnoreQueryFilters()
                .Where(j => j.TenantId != tenantId
                    && (j.Status == AiCatalogJobStatus.Queued || j.Status == AiCatalogJobStatus.Running))
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, AiCatalogJobStatus.Cancelled));
        }
        await Workers.RunOnceAsync<AiCatalogWorker>(factory);
    }
}
