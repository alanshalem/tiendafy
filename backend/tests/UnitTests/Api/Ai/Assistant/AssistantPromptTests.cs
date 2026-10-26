using System.Text.RegularExpressions;
using Api.Ai.Assistant;
using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai.Assistant;

/// <summary>El prompt constante del asistente y el recorte del historial que manda el cliente.</summary>
public sealed class AssistantPromptTests
{
    private static AssistantTurn Turn(string tag, int chars = 10) =>
        new($"P{tag}".PadRight(chars, 'x'), $"R{tag}".PadRight(chars, 'y'));

    [Fact]
    public void System_es_constante_y_sin_fechas()
    {
        Assert.Equal(AssistantPrompt.System, AssistantPrompt.System);
        Assert.DoesNotMatch(@"\d{4}", AssistantPrompt.System);
    }

    [Fact]
    public void Question_lleva_la_fecha_y_delimita_la_pregunta()
    {
        var message = AssistantPrompt.Question("¿Cuánto vendí?", new DateOnly(2026, 10, 25));

        Assert.Equal(ChatRole.User, message.Role);
        Assert.Contains("Hoy es 25/10/2026", message.Text);
        Assert.Contains("<pregunta>¿Cuánto vendí?</pregunta>", message.Text);
    }

    [Fact]
    public void Clip_deja_las_ultimas_cuatro()
    {
        var turns = Enumerable.Range(1, 6).Select(i => Turn(i.ToString())).ToList();

        var clipped = AssistantHistory.Clip(turns);

        Assert.Equal(turns.Skip(2), clipped);
    }

    [Fact]
    public void Clip_respeta_4000_caracteres()
    {
        var turns = Enumerable.Range(1, 4).Select(i => Turn(i.ToString(), 750)).ToList(); // 1.500 por vuelta

        var clipped = AssistantHistory.Clip(turns);

        Assert.Equal(turns.Skip(2), clipped);
    }

    [Fact]
    public void Clip_corta_una_sola_vuelta_larga()
    {
        var clipped = AssistantHistory.Clip([new AssistantTurn(new string('p', 500), new string('r', 5_500))]);

        var only = Assert.Single(clipped);
        Assert.True(only.Question.Length + only.Answer.Length <= 4_000);
    }

    [Fact]
    public void Clip_corta_tambien_una_pregunta_larga()
    {
        var clipped = AssistantHistory.Clip([new AssistantTurn(new string('p', 9_000), new string('r', 100))]);

        var only = Assert.Single(clipped);
        Assert.Equal(AssistantHistory.MaxChars, AssistantHistory.Chars(clipped));
        Assert.Equal(AssistantHistory.MaxChars, only.Question.Length);
        Assert.Empty(only.Answer);
    }

    [Fact]
    public void Clip_descarta_turnos_nulos_y_trata_textos_nulos_como_vacios()
    {
        var clipped = AssistantHistory.Clip([null, new AssistantTurn(null!, null!), Turn("1")]);

        Assert.Equal([new AssistantTurn("", ""), Turn("1")], clipped);
    }

    [Fact]
    public void Clip_de_null_es_vacio() => Assert.Empty(AssistantHistory.Clip(null));

    [Fact]
    public void ToMessages_alterna_roles_sin_AuthorName()
    {
        var messages = AssistantHistory.ToMessages([Turn("1"), Turn("2")]).ToList();

        Assert.Equal([ChatRole.User, ChatRole.Assistant, ChatRole.User, ChatRole.Assistant], messages.Select(m => m.Role));
        Assert.All(messages, m => Assert.Null(m.AuthorName));
    }

    [Fact]
    public void Estimacion_crece_con_el_historial()
    {
        const string question = "¿Cuánto vendí?";
        var without = AssistantPrompt.EstimateInputTokens(question, [], 8);
        var with = AssistantPrompt.EstimateInputTokens(question, [Turn("1", 100), Turn("2", 100)], 8);

        Assert.True(with > without);
        Assert.Equal((int)Math.Ceiling((AssistantPrompt.System.Length + 3_200 + 14 + 24_000) / 3.0), without);
    }

    [Fact]
    public void System_no_pide_inventar() =>
        Assert.Matches(new Regex("no estimes ni inventes"), AssistantPrompt.System);
}
