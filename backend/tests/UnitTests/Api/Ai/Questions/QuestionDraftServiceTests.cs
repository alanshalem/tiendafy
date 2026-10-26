using Ai.Infrastructure;
using Api.Ai;
using Api.Ai.Questions;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace UnitTests.Api.Ai.Questions;

/// <summary>
/// Lo que el servicio de borradores hace con las herramientas además de ofrecerlas: registra las fallas de
/// los lectores sin el mensaje de la excepción, reserva su margen de tokens y le pasa a los avisos si el
/// seguimiento trajo fecha de entrega. El recorrido completo se prueba en integración (AiQuestionDraftTests).
/// </summary>
public sealed class QuestionDraftServiceTests
{
    private const string Shipping = "{\"categoria\":\"envio\",\"motivo\":\"pregunta cuándo llega\"}";

    [Fact]
    public async Task La_falla_de_un_lector_se_loguea_sin_el_mensaje()
    {
        var logger = new CapturingLogger();
        var gateway = new TaskGateway(
            Reply(Shipping),
            [Call("seguimiento"), Reply("Ya salió, te avisamos cuando se mueva.")]);
        var readers = new DraftReaders(Tracking: _ => throw new InvalidOperationException("juan@x.com dirección privada"));

        var result = await new QuestionDraftService(gateway, logger).DraftAsync(Subject(readers), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var line = Assert.Single(logger.Lines);
        Assert.Contains("seguimiento", line);
        Assert.Contains(nameof(InvalidOperationException), line);
        Assert.DoesNotContain("juan@x.com", line);
    }

    [Fact]
    public async Task Un_lector_que_se_pasa_de_tiempo_se_loguea_como_timeout()
    {
        var logger = new CapturingLogger();
        var gateway = new TaskGateway(Reply(Shipping), [Call("seguimiento"), Reply("No tengo el dato del envío ahora.")]);
        var readers = new DraftReaders(Tracking: async ct =>
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            return new TrackingInfo("En camino.", true);
        });
        var service = new QuestionDraftService(gateway, logger) { NewToolLog = () => new DraftToolLog(TimeSpan.FromMilliseconds(50)) };

        var result = await service.DraftAsync(Subject(readers), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Contains("True", Assert.Single(logger.Lines));
    }

    [Fact]
    public async Task Reserva_el_margen_de_las_herramientas()
    {
        var withTool = new TaskGateway(Reply(Shipping), [Reply("Ya salió.")]);
        var readers = new DraftReaders(Tracking: _ => Task.FromResult(new TrackingInfo("En camino.", false)));
        await new QuestionDraftService(withTool, new CapturingLogger()).DraftAsync(Subject(readers), CancellationToken.None);

        var withoutTools = new TaskGateway(Reply(Shipping), [Reply("Ya salió.")]);
        await new QuestionDraftService(withoutTools, new CapturingLogger()).DraftAsync(Subject(new DraftReaders()), CancellationToken.None);

        Assert.Equal(1, withTool.DraftTools);
        Assert.Equal(0, withoutTools.DraftTools);
        Assert.Equal(QuestionTools.AllowanceTokens(1), withTool.DraftEstimate - withoutTools.DraftEstimate);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task La_fecha_del_seguimiento_respalda_la_promesa(bool estimateKnown, bool warns)
    {
        var gateway = new TaskGateway(Reply(Shipping), [Call("seguimiento"), Reply("Te llega en 3 días hábiles.")]);
        var readers = new DraftReaders(Tracking: _ => Task.FromResult(new TrackingInfo("Llega el 28/10.", estimateKnown)));

        var result = await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(Subject(readers), CancellationToken.None);

        Assert.Equal(warns, result.Value.Warnings.Any(w => w.Code == "delivery-date"));
    }

    [Fact]
    public async Task Sin_mensaje_del_comprador_no_llama_a_la_IA()
    {
        var gateway = new TaskGateway(Reply(Shipping), []);
        var subject = Subject(new DraftReaders()) with { Thread = [new ThreadLine(true, "Hola, ¿pudiste ver el envío?"), new ThreadLine(false, "  ")] };

        var result = await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(subject, CancellationToken.None);

        Assert.Equal("Ai.NothingToAnswer", result.Error.Code);
        Assert.Empty(gateway.Ran);
    }

    private static DraftSubject Subject(DraftReaders readers) =>
        new(DraftChannel.SupportChat, [new ThreadLine(false, "¿Cuándo me llega?")], "Pedido #1001, pagado.", [], readers);

    private static ChatResponse Reply(string text) => new(new ChatMessage(ChatRole.Assistant, text));

    private static ChatResponse Call(string tool) =>
        new(new ChatMessage(ChatRole.Assistant, [new FunctionCallContent("call-1", tool)]));

    /// <summary>Corre el cuerpo de cada tarea contra su propio <see cref="FakeChatClient"/>.</summary>
    private sealed class TaskGateway(FakeChatClient classify, FakeChatClient draft) : IAiGateway
    {
        public TaskGateway(ChatResponse classify, ChatResponse[] draft) : this(new FakeChatClient(classify), new FakeChatClient(draft)) { }

        public List<AiTask> Ran { get; } = [];
        public int DraftEstimate { get; private set; }
        public int DraftTools => draft.Options.FirstOrDefault()?.Tools?.Count ?? 0;

        public Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public async Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
            Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)
        {
            Ran.Add(task);
            if (task == AiTask.QuestionDraft) DraftEstimate = options.EstimatedInputTokens;
            var client = task == AiTask.QuestionClassify ? classify : draft;
            return Result.Success(await body(AiRunContexts.For(client, task), ct));
        }
    }

    private sealed class CapturingLogger : ILogger<QuestionDraftService>
    {
        public List<string> Lines { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Lines.Add(formatter(state, exception));
    }
}
