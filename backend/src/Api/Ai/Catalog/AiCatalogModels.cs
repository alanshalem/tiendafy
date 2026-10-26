using System.Text.Json;
using Ai.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>Lo que contestó un modelo (el texto de la respuesta final) y la corrida, para sumar su costo real desde el consumo.</summary>
public sealed record AiModelCall(string Text, Guid RunId);

/// <summary>Las dos llamadas a modelos del trabajo de fichas. Una interfaz para probar el bucle sin gateway.</summary>
public interface IAiCatalogModels
{
    /// <summary><c>CatalogWrite</c>: redacta la ficha. Sin herramientas.</summary>
    Task<Result<AiModelCall>> WriteAsync(string user, Guid tenantId, Guid userId, CancellationToken ct);

    /// <summary><c>CatalogJudge</c>: evalúa la ficha, con un modelo de otro proveedor. Sin herramientas.</summary>
    Task<Result<AiModelCall>> JudgeAsync(string user, Guid tenantId, Guid userId, CancellationToken ct);
}

/// <summary>
/// Pasa por el gateway: el worker no tiene request, así que la tienda y el usuario que pidió el trabajo van en
/// <see cref="AiRunOptions"/>. Los errores del gateway vuelven tal cual.
/// </summary>
public sealed class AiCatalogModels(IAiGateway gateway) : IAiCatalogModels
{
    public Task<Result<AiModelCall>> WriteAsync(string user, Guid tenantId, Guid userId, CancellationToken ct) =>
        RunAsync(AiTask.CatalogWrite, AiCatalogPrompts.WriteSystem, AiCatalogJson.WriteSchema,
            "ficha_de_producto", "Descripción, SEO y atributos de un producto.", user, tenantId, userId, ct);

    public Task<Result<AiModelCall>> JudgeAsync(string user, Guid tenantId, Guid userId, CancellationToken ct) =>
        RunAsync(AiTask.CatalogJudge, AiCatalogPrompts.JudgeSystem, AiCatalogJson.JudgeSchema,
            "evaluacion_de_ficha", "Rúbrica de evaluación de una ficha de producto.", user, tenantId, userId, ct);

    private Task<Result<AiModelCall>> RunAsync(
        AiTask task, string system, JsonElement schema, string schemaName, string schemaDescription,
        string user, Guid tenantId, Guid userId, CancellationToken ct) =>
        gateway.RunAsync(
            task,
            new AiRunOptions(AiCatalogPrompts.EstimateInputTokens(system, user), tenantId, userId),
            async (ctx, token) =>
            {
                var options = ctx.NewOptions();
                options.ResponseFormat = ChatResponseFormat.ForJsonSchema(schema, schemaName, schemaDescription);
                var response = await ctx.Chat.GetResponseAsync(
                    [ctx.System(system), new ChatMessage(ChatRole.User, user)], options, token);
                return new AiModelCall(response.FinalText(), ctx.RunId);
            },
            ct);
}
