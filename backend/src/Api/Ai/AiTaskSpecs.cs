using Ai.Infrastructure;

namespace Api.Ai;

/// <summary>Requisitos y límites de una tarea. <see cref="Cheap"/> es la sugerencia de usar un modelo barato.</summary>
public sealed record AiTaskSpec(
    AiTask Task,
    AiCapability Requires,
    int MaxIterations,
    int MaxOutputTokens,
    TimeSpan Timeout,
    string? ClaudeEffort,
    bool Cheap);

public static class AiTaskSpecs
{
    public static IReadOnlyList<AiTaskSpec> All { get; } =
    [
        new(AiTask.QuestionClassify, AiCapability.Json, 1, 200, TimeSpan.FromSeconds(10), "low", true),
        new(AiTask.QuestionDraft, AiCapability.Tools, 3, 600, TimeSpan.FromSeconds(30), "medium", false),
        new(AiTask.DataAssistant, AiCapability.Tools, 6, 1_500, TimeSpan.FromSeconds(60), "medium", false),
        new(AiTask.CatalogWrite, AiCapability.Json, 1, 1_500, TimeSpan.FromSeconds(60), "medium", false),
        new(AiTask.CatalogJudge, AiCapability.Json, 1, 400, TimeSpan.FromSeconds(30), "low", true),
        new(AiTask.InvoiceRead, AiCapability.Json | AiCapability.Pdf | AiCapability.Image, 1, 4_000, TimeSpan.FromSeconds(120), "medium", false),
        new(AiTask.ShortText, AiCapability.None, 1, 600, TimeSpan.FromSeconds(30), "low", true),
    ];

    public static AiTaskSpec For(AiTask task) =>
        All.FirstOrDefault(s => s.Task == task)
        ?? throw new ArgumentOutOfRangeException(nameof(task), task, "Tarea de IA sin especificación.");
}
