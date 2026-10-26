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
    private static readonly ChatResponseFormat Format = ChatResponseFormat.ForJsonSchema(
        BuildSchema(), "clasificacion_consulta", "Categoría de la consulta del comprador y el motivo en una frase.");

    /// <summary>El <c>enum</c> de <c>categoria</c> sale de <see cref="QuestionCategories.Wire"/>: no se desfasa del enum de C#.</summary>
    private static JsonElement BuildSchema()
    {
        using var stream = new MemoryStream();
        using (var w = new Utf8JsonWriter(stream))
        {
            w.WriteStartObject();
            w.WriteString("type", "object");
            w.WriteStartObject("properties");
            w.WriteStartObject("categoria");
            w.WriteString("type", "string");
            w.WriteStartArray("enum");
            foreach (var category in Enum.GetValues<QuestionCategory>()) w.WriteStringValue(QuestionCategories.Wire(category));
            w.WriteEndArray();
            w.WriteEndObject();
            w.WriteStartObject("motivo");
            w.WriteString("type", "string");
            w.WriteEndObject();
            w.WriteEndObject();
            w.WriteStartArray("required");
            w.WriteStringValue("categoria");
            w.WriteStringValue("motivo");
            w.WriteEndArray();
            w.WriteBoolean("additionalProperties", false);
            w.WriteEndObject();
        }
        using var doc = JsonDocument.Parse(stream.ToArray());
        return doc.RootElement.Clone();
    }

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
