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
    private const string Other = "{\"categoria\":\"otro\",\"motivo\":\"consulta\"}";

    /// <summary>Lo que Claude suele escribir antes de llamar a una herramienta: nunca va al borrador.</summary>
    private const string Narration = "Voy a consultar el dato.";

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
    public async Task El_borrador_es_solo_el_ultimo_mensaje_del_asistente()
    {
        var gateway = new TaskGateway(Reply(Shipping), [Call("seguimiento"), Reply("Ya salió, te avisamos cuando se mueva.")]);
        var readers = new DraftReaders(Tracking: _ => Task.FromResult(new TrackingInfo("En camino.", false)));

        var result = await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(Subject(readers), CancellationToken.None);

        Assert.Equal("Ya salió, te avisamos cuando se mueva.", result.Value.Text);
        Assert.DoesNotContain(Narration, result.Value.Text);
    }

    [Fact]
    public async Task Un_hilo_largo_pierde_lo_mas_viejo_y_no_el_ultimo_del_comprador()
    {
        var gateway = new TaskGateway(Reply(Other), [Reply("Ya lo vemos.")]);
        var subject = Subject(new DraftReaders()) with
        {
            Thread =
            [
                new ThreadLine(false, "VIEJO " + new string('v', 1_480)),
                new ThreadLine(true, "Te lo reviso"),
                new ThreadLine(false, "ÚLTIMO-DEL-COMPRADOR"),
            ],
        };

        await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(subject, CancellationToken.None);

        foreach (var prompt in new[] { TextOf(Assert.Single(gateway.ClassifyCalls)), TextOf(Assert.Single(gateway.DraftCalls)) })
        {
            Assert.Contains("Comprador: ÚLTIMO-DEL-COMPRADOR", prompt);
            Assert.Contains("Vendedor: Te lo reviso", prompt);
            Assert.DoesNotContain("VIEJO", prompt);
        }
    }

    [Fact]
    public async Task El_ultimo_del_comprador_queda_aunque_lo_sigan_respuestas_del_vendedor()
    {
        var gateway = new TaskGateway(Reply(Other), [Reply("Ya lo vemos.")]);
        var subject = Subject(new DraftReaders()) with
        {
            Thread = [new ThreadLine(false, "PREGUNTA " + new string('p', 1_300)), new ThreadLine(true, "RESPUESTA " + new string('r', 400))],
        };

        await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(subject, CancellationToken.None);

        var prompt = TextOf(Assert.Single(gateway.ClassifyCalls));
        Assert.Contains("Comprador: PREGUNTA " + new string('p', 1_300), prompt);
        Assert.DoesNotContain("RESPUESTA", prompt);
    }

    [Fact]
    public async Task Un_ultimo_mensaje_enorme_se_recorta_por_el_final()
    {
        var gateway = new TaskGateway(Reply(Other), [Reply("Ya lo vemos.")]);
        var subject = Subject(new DraftReaders()) with
        {
            Thread = [new ThreadLine(false, "Primero"), new ThreadLine(false, "INICIO " + new string('x', 3_000) + " FINAL")],
        };

        await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(subject, CancellationToken.None);

        var prompt = TextOf(Assert.Single(gateway.ClassifyCalls));
        Assert.Contains("Comprador: INICIO xxx", prompt);
        Assert.DoesNotContain("FINAL", prompt);
        Assert.DoesNotContain("Primero", prompt);
        var open = $"<{QuestionDraftService.ThreadTag}>\n";
        var start = prompt.IndexOf(open, StringComparison.Ordinal) + open.Length;
        var inner = prompt[start..prompt.IndexOf($"\n</{QuestionDraftService.ThreadTag}>", StringComparison.Ordinal)];
        Assert.Equal(UntrustedText.MaxChars, inner.Length);
    }

    [Fact]
    public async Task Los_numeros_conocidos_no_son_datos_de_contacto()
    {
        // Uno lo trae la fuente (el número de pedido de ML) y otro el seguimiento durante la corrida.
        var gateway = new TaskGateway(Reply(Shipping),
            [Call("seguimiento"), Reply("Tu pedido 2000012345678 viaja con el seguimiento 123456789012.")]);
        var readers = new DraftReaders(Tracking: _ => Task.FromResult(new TrackingInfo("Número: 123456789012.", false, ["123456789012"])));
        var subject = Subject(readers) with { KnownReferences = ["2000012345678"] };

        var result = await new QuestionDraftService(gateway, new CapturingLogger()).DraftAsync(subject, CancellationToken.None);

        Assert.DoesNotContain(result.Value.Warnings, w => w.Code == "contact-data");
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

    [Fact]
    public async Task Se_loguean_las_fallas_de_todos_los_intentos()
    {
        var logger = new CapturingLogger();
        // El principal llama a la herramienta (que falla) y después se cae; el respaldo la vuelve a llamar.
        var gateway = new TaskGateway(
            new FakeChatClient(Reply(Shipping)),
            new FakeChatClient(Call("seguimiento")),
            new FakeChatClient(Call("seguimiento"), Reply("Ya salió, te avisamos cuando se mueva.")));
        var readers = new DraftReaders(Tracking: _ => throw new InvalidOperationException("sin servicio"));

        var result = await new QuestionDraftService(gateway, logger).DraftAsync(Subject(readers), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, logger.Lines.Count(l => l.Contains("seguimiento")));
    }

    private static DraftSubject Subject(DraftReaders readers) =>
        new(DraftChannel.SupportChat, [new ThreadLine(false, "¿Cuándo me llega?")], "Pedido #1001, pagado.", [], [], readers);

    private static ChatResponse Reply(string text) => new(new ChatMessage(ChatRole.Assistant, text));

    /// <summary>Un turno con herramienta como los de Claude: una frase y después la llamada.</summary>
    private static ChatResponse Call(string tool) =>
        new(new ChatMessage(ChatRole.Assistant, [new TextContent(Narration), new FunctionCallContent("call-1", tool)]));

    private static string TextOf(IReadOnlyList<ChatMessage> messages) => string.Join("\n", messages.Select(m => m.Text));

    /// <summary>Corre el cuerpo de cada tarea contra su propio <see cref="FakeChatClient"/>.</summary>
    private sealed class TaskGateway(FakeChatClient classify, FakeChatClient draft, FakeChatClient? draftFallback = null) : IAiGateway
    {
        public TaskGateway(ChatResponse classify, ChatResponse[] draft) : this(new FakeChatClient(classify), new FakeChatClient(draft)) { }

        public List<AiTask> Ran { get; } = [];
        public List<IReadOnlyList<ChatMessage>> ClassifyCalls => classify.Calls;
        public List<IReadOnlyList<ChatMessage>> DraftCalls => draft.Calls;
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
            try
            {
                return Result.Success(await body(AiRunContexts.For(client, task), ct));
            }
            catch (InvalidOperationException) when (task == AiTask.QuestionDraft && draftFallback is not null)
            {
                // Como el gateway: el principal se cayó y el cuerpo entero corre de nuevo con el respaldo.
                return Result.Success(await body(AiRunContexts.For(draftFallback, task), ct));
            }
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
