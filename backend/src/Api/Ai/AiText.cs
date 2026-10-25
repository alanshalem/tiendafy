using Ai.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai;

/// <summary>Las funciones de "un prompt, un texto" (sugerencias del panel): una sola llamada, sin herramientas.</summary>
public static class AiText
{
    /// <summary>
    /// Pasa por el gateway y devuelve el texto recortado. Un texto vacío es un error explicado.
    /// El largo de entrada se estima por lo alto (caracteres / 3) para reservar el peor caso del tope.
    /// </summary>
    public static async Task<Result<string>> CompleteAsync(
        this IAiGateway gateway, AiTask task, string system, string prompt, CancellationToken ct)
    {
        var result = await gateway.RunAsync(
            task,
            new AiRunOptions((system.Length + prompt.Length) / 3),
            async (run, token) =>
            {
                var response = await run.Chat.GetResponseAsync(
                    [run.System(system), new ChatMessage(ChatRole.User, prompt)], run.NewOptions(), token);
                return response.Text.Trim();
            },
            ct);

        if (result.IsFailure) return Result.Failure<string>(result.Error);
        return result.Value.Length == 0
            ? Result.Failure<string>(AiErrors.Empty)
            : Result.Success(result.Value);
    }
}
