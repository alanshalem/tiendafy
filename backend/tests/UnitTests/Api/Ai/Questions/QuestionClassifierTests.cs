using System.Text.RegularExpressions;
using Ai.Infrastructure;
using Api.Ai;
using Api.Ai.Questions;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace UnitTests.Api.Ai.Questions;

public sealed class QuestionClassifierTests
{
    private static readonly string UserText =
        QuestionPrompts.ChannelLabel(DraftChannel.MeliQuestion) + "\n<pregunta>hola</pregunta>";

    [Fact]
    public void Json_valido()
    {
        var result = QuestionClassification.Parse("{\"categoria\":\"stock\",\"motivo\":\"pregunta si hay\"}");

        Assert.Equal(new QuestionClassification(QuestionCategory.Stock, "pregunta si hay"), result);
    }

    [Fact]
    public void Tolera_bloque_de_codigo()
    {
        var result = QuestionClassification.Parse("```json\n{\"categoria\":\"stock\",\"motivo\":\"x\"}\n```");

        Assert.Equal(QuestionCategory.Stock, result.Category);
    }

    [Fact]
    public void Categoria_desconocida_es_otro() =>
        Assert.Equal(new QuestionClassification(QuestionCategory.Other, ""),
            QuestionClassification.Parse("{\"categoria\":\"inventada\",\"motivo\":\"x\"}"));

    [Fact]
    public void Json_roto_es_otro() =>
        Assert.Equal(new QuestionClassification(QuestionCategory.Other, ""), QuestionClassification.Parse("{\"categoria\":"));

    [Fact]
    public void Null_es_otro() =>
        Assert.Equal(new QuestionClassification(QuestionCategory.Other, ""), QuestionClassification.Parse(null));

    [Fact]
    public void Motivo_se_recorta()
    {
        var json = "{\"categoria\":\"precio\",\"motivo\":\"" + new string('a', 500) + "\"}";

        var result = QuestionClassification.Parse(json);

        Assert.Equal(QuestionCategory.Price, result.Category);
        Assert.True(result.Reason.Length <= QuestionClassification.MaxReasonChars);
    }

    [Fact]
    public void Wire_ida_y_vuelta()
    {
        foreach (var c in Enum.GetValues<QuestionCategory>())
            Assert.Equal(c, QuestionCategories.FromWire(QuestionCategories.Wire(c)));

        Assert.Equal("fuera_de_politica", QuestionCategories.Wire(QuestionCategory.OutOfPolicy));
        Assert.Null(QuestionCategories.FromWire("nada"));
        Assert.Null(QuestionCategories.FromWire(null));
    }

    [Fact]
    public void Los_system_prompts_no_cambian_entre_llamadas()
    {
        var date = new Regex(@"\d{4}-\d{2}");
        foreach (var channel in Enum.GetValues<DraftChannel>())
        {
            var first = QuestionPrompts.DraftSystem(channel);
            Assert.Same(first, QuestionPrompts.DraftSystem(channel));
            Assert.DoesNotMatch(date, first);
        }
        Assert.DoesNotMatch(date, QuestionPrompts.ClassifySystem);
    }

    [Fact]
    public void Estima_por_lo_alto() => Assert.Equal(2, QuestionPrompts.EstimateTokens("abcd", "ef"));

    [Fact]
    public void El_aviso_de_envio_en_ML_remite_al_calculador() =>
        Assert.Contains("calculador de envío",
            QuestionPrompts.CategoryHint(DraftChannel.MeliQuestion, QuestionCategory.Shipping));

    [Fact]
    public async Task RunAsync_manda_el_system_constante_y_formato_JSON()
    {
        var fake = new FakeChatClient(new ChatResponse(new ChatMessage(ChatRole.Assistant,
            "{\"categoria\":\"envio\",\"motivo\":\"cuánto tarda\"}")));
        var gateway = new DirectGateway(fake);

        var result = await QuestionClassifier.RunAsync(gateway, DraftChannel.MeliQuestion, "<pregunta>hola</pregunta>", default);

        Assert.True(result.IsSuccess);
        Assert.Equal(QuestionCategory.Shipping, result.Value.Category);
        Assert.Equal(AiTask.QuestionClassify, gateway.RanTask);
        Assert.Equal(QuestionPrompts.EstimateTokens(QuestionPrompts.ClassifySystem, UserText),
            gateway.Options!.EstimatedInputTokens);

        var messages = Assert.Single(fake.Calls);
        Assert.Equal(ChatRole.System, messages[0].Role);
        Assert.Equal(QuestionPrompts.ClassifySystem, messages[0].Text);
        Assert.Equal(ChatRole.User, messages[1].Role);
        Assert.Equal(UserText, messages[1].Text);
        var format = Assert.IsType<ChatResponseFormatJson>(Assert.Single(fake.Options)!.ResponseFormat);
        Assert.NotNull(format.Schema);
    }

    [Fact]
    public async Task RunAsync_devuelve_el_error_del_gateway()
    {
        var error = new Error("Ai.Disabled", "apagada");
        var result = await QuestionClassifier.RunAsync(new DirectGateway(new FakeChatClient()) { Fail = error },
            DraftChannel.Contact, "x", default);

        Assert.True(result.IsFailure);
        Assert.Equal(error, result.Error);
    }

    /// <summary>Ejecuta el cuerpo tal cual contra el cliente falso, sin presupuesto ni respaldo.</summary>
    private sealed class DirectGateway(FakeChatClient client) : IAiGateway
    {
        public AiTask? RanTask { get; private set; }
        public AiRunOptions? Options { get; private set; }
        public Error? Fail { get; init; }

        public Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public async Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
            Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)
        {
            RanTask = task;
            Options = options;
            if (Fail is { } error) return Result.Failure<T>(error);
            return Result.Success(await body(AiRunContexts.For(client, task), ct));
        }
    }
}
