namespace Api.Ai.Assistant;

public static class AssistantRegistration
{
    /// <summary>Scoped: los datos, las herramientas y el servicio usan los contextos de la base del request.</summary>
    public static IServiceCollection AddAssistant(this IServiceCollection services)
    {
        services.AddScoped<IAssistantData, AssistantData>();
        services.AddScoped<AssistantToolset>();
        services.AddScoped<AssistantService>();
        return services;
    }
}
