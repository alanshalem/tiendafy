using Microsoft.Extensions.AI;

namespace Api.Ai.Assistant;

/// <summary>Una vuelta de la conversación: lo que preguntó la persona y lo que contestó el asistente.</summary>
public sealed record AssistantTurn(string Question, string Answer);

/// <summary>
/// El historial que viaja con cada pregunta: el cliente lo manda, así que se recorta acá para que no crezca
/// sin tope. Solo texto de preguntas y respuestas, nunca resultados de herramientas.
/// </summary>
public static class AssistantHistory
{
    public const int MaxTurns = 4, MaxChars = 4_000;

    /// <summary>
    /// Las últimas <see cref="MaxTurns"/>; si suman más de <see cref="MaxChars"/>, se tiran las más viejas;
    /// si la última sola no entra, se corta su respuesta.
    /// </summary>
    public static IReadOnlyList<AssistantTurn> Clip(IReadOnlyList<AssistantTurn>? turns)
    {
        if (turns is null || turns.Count == 0) return [];

        var kept = turns.Skip(Math.Max(0, turns.Count - MaxTurns)).ToList();
        while (kept.Count > 1 && Chars(kept) > MaxChars) kept.RemoveAt(0);

        if (Chars(kept) > MaxChars)
        {
            var only = kept[0];
            var room = Math.Max(0, MaxChars - only.Question.Length);
            kept[0] = only with { Answer = only.Answer[..Math.Min(only.Answer.Length, room)] };
        }
        return kept;
    }

    public static IEnumerable<ChatMessage> ToMessages(IReadOnlyList<AssistantTurn> turns)
    {
        foreach (var turn in turns)
        {
            yield return new ChatMessage(ChatRole.User, turn.Question);
            yield return new ChatMessage(ChatRole.Assistant, turn.Answer);
        }
    }

    public static int Chars(IEnumerable<AssistantTurn> turns) => turns.Sum(t => t.Question.Length + t.Answer.Length);
}
