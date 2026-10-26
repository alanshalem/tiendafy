using Microsoft.Extensions.DependencyInjection;

namespace Api.Stats;

/// <summary>
/// Las consultas de estadísticas que comparten el panel y el asistente. Son
/// scoped: usan los DbContext del request.
/// </summary>
public static class StatsQueriesRegistration
{
    public static IServiceCollection AddStatsQueries(this IServiceCollection services)
    {
        services.AddScoped<SalesOverviewQuery>();
        services.AddScoped<TopProductsQuery>();
        services.AddScoped<ProfitabilityQuery>();
        return services;
    }
}
