namespace Api.Ai.Catalog;

public static class AiCatalogRegistration
{
    /// <summary>Scoped: el gateway y los contextos de la base son del request (o del scope de cada ítem en el worker).</summary>
    public static IServiceCollection AddAiCatalog(this IServiceCollection services)
    {
        services.AddScoped<IAiCatalogModels, AiCatalogModels>();
        services.AddScoped<AiCatalogDrafter>();
        services.AddScoped<AiCatalogSelection>();
        services.AddScoped<AiCatalogJobs>();
        return services;
    }
}
