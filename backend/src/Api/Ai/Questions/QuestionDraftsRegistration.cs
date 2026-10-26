namespace Api.Ai.Questions;

public static class QuestionDraftsRegistration
{
    /// <summary>Scoped: el gateway y los contextos de la base son del request.</summary>
    public static IServiceCollection AddQuestionDrafts(this IServiceCollection services)
    {
        services.AddScoped<QuestionDraftService>();
        services.AddScoped<MeliDraftSources>();
        services.AddScoped<StoreDraftSources>();
        return services;
    }
}
