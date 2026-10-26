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
    /// Las últimas <see cref="MaxTurns"/> vueltas (las <c>null</c> se descartan y un texto <c>null</c> cuenta
    /// como vacío); si suman más de <see cref="MaxChars"/>, se tiran las más viejas; si la última sola no
    /// entra, se corta su respuesta y, si ni con eso, también su pregunta.
    /// </summary>
    public static IReadOnlyList<AssistantTurn> Clip(IReadOnlyList<AssistantTurn?>? turns)
    {
        if (turns is null) return [];

        var clean = turns.Where(t => t is not null)
            .Select(t => new AssistantTurn(t!.Question ?? "", t.Answer ?? ""))
            .ToList();
        var kept = clean.Skip(Math.Max(0, clean.Count - MaxTurns)).ToList();
        while (kept.Count > 1 && Chars(kept) > MaxChars) kept.RemoveAt(0);

        if (kept.Count == 1 && Chars(kept) > MaxChars)
        {
            var only = kept[0];
            var question = only.Question[..Math.Min(only.Question.Length, MaxChars)];
            var room = MaxChars - question.Length;
            kept[0] = new AssistantTurn(question, only.Answer[..Math.Min(only.Answer.Length, room)]);
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

    public static int Chars(IEnumerable<AssistantTurn> turns) => turns.Sum(t => (t.Question?.Length ?? 0) + (t.Answer?.Length ?? 0));
}
