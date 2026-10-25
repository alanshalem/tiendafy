using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai;

/// <summary>
/// Arma un <see cref="AiRunContext"/> sin pasar por el gateway, para probar el cuerpo de una función
/// de IA contra un <see cref="FakeChatClient"/>. <see cref="AiRunContext.Chat"/> es el cliente tal cual
/// (sin medidor): lo que se prueba es el cuerpo, no el consumo.
/// </summary>
public static class AiRunContexts
{
    public static AiRunContext For(IChatClient client, AiTask task, string modelId = "claude-sonnet-5-5") =>
        new(Guid.NewGuid(), AiTaskSpecs.For(task),
            AiModelCatalog.Find(modelId) ?? throw new ArgumentException($"{modelId} no está en el catálogo.", nameof(modelId)),
            client);
}
