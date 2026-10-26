using Ai.Infrastructure;
using Microsoft.Extensions.AI;

namespace IntegrationTests;

/// <summary>Deja la IA de una tienda lista para usar en un test: clave, modelos por tarea y tope (lo mismo que hace el dueño en Configuración).</summary>
public static class AiSetup
{
    public const string Haiku = "claude-haiku-5-5";
    public const string Sonnet = "claude-sonnet-5-5";
    private const string Config = "/api/v1/ai/config";

    /// <summary>Clave de Anthropic de mentira, un modelo por tarea y la IA prendida con tope de 20 dólares.</summary>
    public static async Task ConfigureAsync(Merchant merchant, params (AiTask Task, string Model)[] assignments)
    {
        await merchant.ExpectOkAsync(HttpMethod.Put, $"{Config}/providers/Anthropic", new { apiKey = "sk-test-123456a1b2" });
        var items = assignments.Select(a => new { task = a.Task.ToString(), primaryModel = a.Model }).ToArray();
        var saved = await merchant.SendAsync(HttpMethod.Put, $"{Config}/assignments", new { items });
        Assert.Equal(System.Net.HttpStatusCode.NoContent, saved.StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"{Config}/settings", new { enabled = true, monthlyBudgetUsd = 20, alertThresholdPct = 80 });
    }

    /// <summary>Una sola tarea lista para usar con ese modelo (la clave de Anthropic, la asignación y el tope).</summary>
    public static Task EnableAsync(Merchant owner, AiTask task, string modelId) => ConfigureAsync(owner, (task, modelId));

    /// <summary>Los borradores de la bandeja: Haiku clasifica y Sonnet redacta.</summary>
    public static Task EnableDraftsAsync(Merchant merchant) =>
        ConfigureAsync(merchant, (AiTask.QuestionClassify, Haiku), (AiTask.QuestionDraft, Sonnet));

    public static ChatResponse Reply(string text, long input = 10, long output = 5) =>
        new(new ChatMessage(ChatRole.Assistant, text)) { Usage = new UsageDetails { InputTokenCount = input, OutputTokenCount = output } };
}
