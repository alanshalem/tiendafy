using System.Text.Json;
using Ai.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Primer paso de la bandeja: ubica la consulta del comprador en una categoría para que el borrador
/// lleve el criterio justo. Recibe el hilo ya redactado (<see cref="PiiRedactor"/>) y envuelto
/// (<see cref="UntrustedText"/>); nunca ve datos personales.
/// </summary>
public static class QuestionClassifier
{
    private static readonly JsonElement Schema = JsonDocument.Parse("""
        {
          "type": "object",
          "properties": {
            "categoria": { "type": "string", "enum": ["stock", "envio", "producto", "precio", "postventa", "fuera_de_politica", "otro"] },
            "motivo": { "type": "string" }
          },
          "required": ["categoria", "motivo"],
          "additionalProperties": false
        }
        """).RootElement.Clone();

    private static readonly ChatResponseFormat Format = ChatResponseFormat.ForJsonSchema(
        Schema, "clasificacion_consulta", "Categoría de la consulta del comprador y el motivo en una frase.");

    /// <summary>
    /// Si el gateway falla (apagada, sin cupo, proveedor caído), devuelve su error tal cual: el que llama
    /// decide si sigue sin categoría.
    /// </summary>
    public static Task<Result<QuestionClassification>> RunAsync(
        IAiGateway gateway, DraftChannel channel, string redactedThread, CancellationToken ct)
    {
        var user = $"{QuestionPrompts.ChannelLabel(channel)}\n{redactedThread}";
        return gateway.RunAsync(
            AiTask.QuestionClassify,
            new AiRunOptions(QuestionPrompts.EstimateTokens(QuestionPrompts.ClassifySystem, user)),
            async (ctx, token) =>
            {
                var options = ctx.NewOptions();
                options.ResponseFormat = Format;
                var response = await ctx.Chat.GetResponseAsync(
                    [ctx.System(QuestionPrompts.ClassifySystem), new ChatMessage(ChatRole.User, user)], options, token);
                return QuestionClassification.Parse(response.Text);
            },
            ct);
    }
}
