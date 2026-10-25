using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Ai.Infrastructure;

/// <summary>
/// IA de la plataforma: claves por proveedor, qué modelo hace cada tarea,
/// presupuesto, consumo y trabajos de catálogo. Módulo chico (un proyecto):
/// lo que cruza otros módulos lo orquesta el Api.
/// </summary>
public static class AiModule
{
    public static IServiceCollection AddAiModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<AiDbContext>(configuration);

        return services;
    }
}
