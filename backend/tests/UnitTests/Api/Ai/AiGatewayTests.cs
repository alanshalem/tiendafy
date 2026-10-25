using System.ClientModel;
using System.ClientModel.Primitives;
using System.Net;
using System.Text;
using Ai.Infrastructure;
using Anthropic.Exceptions;
using Api.Ai;
using Api.Endpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using CacheControlEphemeral = Anthropic.Models.Messages.CacheControlEphemeral;

namespace UnitTests.Api.Ai;

public sealed class AiGatewayTests
{
    private const string Sonnet = "claude-sonnet-5-5";
    private const string Sol = "gpt-6.1-sol";
    private const long HundredUsd = 100_000_000;

    private static readonly Guid Tenant = Guid.NewGuid();
    private static readonly AiRunOptions Small = new(EstimatedInputTokens: 100);

    // ---- Fakes ----

    private sealed class FakeConfig : IAiTenantConfig
    {
        public bool Enabled { get; set; } = true;
        public long BudgetMicroUsd { get; set; } = HundredUsd;
        public Dictionary<AiTask, AiTaskModels> Assignments { get; } = [];
        public Dictionary<AiProvider, string> Keys { get; } = new()
        {
            [AiProvider.Anthropic] = "sk-ant-test",
            [AiProvider.OpenAI] = "sk-test-openai",
        };

        public Task<AiTenantConfigSnapshot> LoadAsync(Guid tenantId, CancellationToken ct) =>
            Task.FromResult(new AiTenantConfigSnapshot(Enabled, BudgetMicroUsd, Assignments, Keys.Keys.ToHashSet()));

        public Task<string?> KeyAsync(Guid tenantId, AiProvider provider, CancellationToken ct) =>
            Task.FromResult(Keys.GetValueOrDefault(provider));
    }

    /// <summary>Devuelve el cliente cargado para cada modelo y registra qué se creó y qué se liberó.</summary>
    private sealed class FakeFactory : IAiChatClientFactory
    {
        public Dictionary<string, IChatClient> Clients { get; } = [];
        public List<string> Created { get; } = [];
        public List<TrackedClient> Built { get; } = [];

        public IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens)
        {
            Created.Add(modelId);
            var client = new TrackedClient(Clients[modelId]);
            Built.Add(client);
            return client;
        }
    }

    private sealed class TrackedClient(IChatClient inner) : DelegatingChatClient(inner)
    {
        public bool Disposed { get; private set; }

        protected override void Dispose(bool disposing)
        {
            Disposed = true;
            base.Dispose(disposing);
        }
    }

    private sealed class ThrowingClient(Func<Exception> error) : IChatClient
    {
        public int Calls { get; private set; }

        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
        {
            Calls++;
            throw error();
        }

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public object? GetService(Type serviceType, object? serviceKey = null) => null;

        public void Dispose() { }
    }

    /// <summary>No responde nunca: espera a que le cancelen el pedido.</summary>
    private sealed class HangingClient : IChatClient
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
        {
            Started.TrySetResult();
            await Task.Delay(Timeout.Infinite, cancellationToken);
            throw new InvalidOperationException("No debería llegar acá.");
        }

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public object? GetService(Type serviceType, object? serviceKey = null) => null;

        public void Dispose() { }
    }

    private sealed class FakeRecorder : IAiUsageRecorder
    {
        public List<AiUsageEntry> Entries { get; } = [];

        public Task RecordAsync(AiUsageEntry entry, CancellationToken ct)
        {
            lock (Entries) Entries.Add(entry);
            return Task.CompletedTask;
        }
    }

    private sealed class FixedSpend(long spent) : IAiMonthSpend
    {
        public Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct) => Task.FromResult(spent);
    }

    private sealed class FakeTenant(Guid id) : ITenantContext
    {
        public TenantId TenantId { get; } = new(id);
        public bool HasTenant => true;
    }

    private sealed class Harness
    {
        public FakeConfig Config { get; } = new();
        public FakeFactory Factory { get; } = new();
        public FakeRecorder Recorder { get; } = new();
        public ManualClock Clock { get; } = new();
        public bool GloballyDisabled { get; set; }

        private AiCircuitBreaker? _breaker;
        public AiCircuitBreaker Breaker => _breaker ??= new AiCircuitBreaker(Clock);

        // Uno solo por arnés, como el singleton real: así se ve si una reserva queda sin liberar.
        private AiBudget? _budget;
        public AiBudget Budget => _budget ??= new AiBudget(new FixedSpend(0), Clock);

        public AiGateway Gateway()
        {
            var settings = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Ai:Disabled"] = GloballyDisabled ? "true" : "false" })
                .Build();
            return new AiGateway(
                settings,
                new FakeTenant(Tenant),
                new HttpContextAccessor(),
                Config,
                Budget,
                Breaker,
                Factory,
                Recorder,
                Clock,
                NullLoggerFactory.Instance);
        }

        public Harness Assign(AiTask task, string primary, string? fallback = null)
        {
            Config.Assignments[task] = new AiTaskModels(primary, fallback);
            return this;
        }
    }

    private static ChatResponse Reply(string text) =>
        new(new ChatMessage(ChatRole.Assistant, text)) { Usage = new UsageDetails { InputTokenCount = 10, OutputTokenCount = 5 } };

    private static async Task<string> AskAsync(AiRunContext ctx, CancellationToken ct) =>
        (await ctx.Chat.GetResponseAsync([ctx.System("Sos un asistente."), new(ChatRole.User, "hola")], ctx.NewOptions(), ct)).Text;

    /// <summary>Terminada la ejecución, lo comprometido en el tope es solo lo real: ninguna reserva quedó tomada.</summary>
    private static async Task AssertOnlyRealSpendCommitted(Harness h)
    {
        var real = h.Recorder.Entries.Sum(e => e.CostMicroUsd ?? 0);
        Assert.Equal(real, await h.Budget.CommittedMicroUsdAsync(Tenant, default));
    }

    private static HttpRequestException Http(HttpStatusCode status) => new HttpRequestException("falla", null, status);

    // ---- Interruptores y configuración ----

    [Fact]
    public async Task Apagado_global_devuelve_Disabled()
    {
        var h = new Harness { GloballyDisabled = true }.Assign(AiTask.ShortText, Sonnet);
        h.Factory.Clients[Sonnet] = new FakeChatClient(Reply("hola"));

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.Disabled", result.Error.Code);
        Assert.Empty(h.Factory.Created);
        var availability = await h.Gateway().AvailabilityAsync(default);
        Assert.All(availability, a => Assert.False(a.Available));
    }

    [Fact]
    public async Task Tienda_apagada_devuelve_Disabled()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet);
        h.Config.Enabled = false;
        h.Factory.Clients[Sonnet] = new FakeChatClient(Reply("hola"));

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.Disabled", result.Error.Code);
        Assert.Equal(ErrorType.Conflict, result.Error.Type);
        Assert.Empty(h.Factory.Created);
    }

    [Fact]
    public async Task Tarea_sin_asignar_devuelve_NotConfigured_y_availability_lo_explica()
    {
        var h = new Harness().Assign(AiTask.QuestionDraft, Sonnet);

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.TaskNotConfigured", result.Error.Code);
        var availability = await h.Gateway().AvailabilityAsync(default);
        Assert.Equal(AiTaskSpecs.All.Count, availability.Count);
        var shortText = Assert.Single(availability, a => a.Task == AiTask.ShortText);
        Assert.False(shortText.Available);
        Assert.Equal("Elegí un modelo para esta tarea en Configuración → Inteligencia artificial.", shortText.Reason);
        var draft = Assert.Single(availability, a => a.Task == AiTask.QuestionDraft);
        Assert.True(draft.Available);
        Assert.Null(draft.Reason);
    }

    [Fact]
    public async Task Sin_la_clave_del_proveedor_availability_lo_explica()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sol);
        h.Config.Keys.Remove(AiProvider.OpenAI);

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.TaskNotConfigured", result.Error.Code);
        Assert.Equal("Falta la clave de OpenAI.", result.Error.Message);
        var shortText = Assert.Single(await h.Gateway().AvailabilityAsync(default), a => a.Task == AiTask.ShortText);
        Assert.False(shortText.Available);
        Assert.Equal("Falta la clave de OpenAI.", shortText.Reason);
    }

    [Fact]
    public async Task Sin_presupuesto_no_llama_al_modelo()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet);
        h.Config.BudgetMicroUsd = 1;
        var model = new FakeChatClient(Reply("hola"));
        h.Factory.Clients[Sonnet] = model;

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.BudgetExceeded", result.Error.Code);
        Assert.Empty(h.Factory.Created);
        Assert.Empty(model.Calls);
    }

    // ---- Respaldo y corte por fallas ----

    [Fact]
    public async Task Un_exito_deja_comprometido_solo_lo_real()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet);
        h.Factory.Clients[Sonnet] = new FakeChatClient(Reply("hola"));

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.True(result.IsSuccess);
        Assert.True(h.Recorder.Entries.Sum(e => e.CostMicroUsd ?? 0) > 0);
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task Con_tope_para_un_solo_peor_caso_el_respaldo_igual_puede_reservar()
    {
        var spec = AiTaskSpecs.For(AiTask.ShortText);
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        // Entra exactamente un peor caso (el mayor de los dos modelos), no dos.
        h.Config.BudgetMicroUsd = Math.Max(
            AiCost.WorstCaseMicroUsd(AiModelCatalog.Find(Sonnet)!, spec, Small.EstimatedInputTokens),
            AiCost.WorstCaseMicroUsd(AiModelCatalog.Find(Sol)!, spec, Small.EstimatedInputTokens));
        h.Factory.Clients[Sonnet] = new ThrowingClient(() => Http(HttpStatusCode.ServiceUnavailable));
        h.Factory.Clients[Sol] = new FakeChatClient(Reply("desde el respaldo"));

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("desde el respaldo", result.Value);
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task _503_del_principal_usa_el_respaldo_una_vez()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        var primary = new ThrowingClient(() => Http(HttpStatusCode.ServiceUnavailable));
        var fallback = new FakeChatClient(Reply("desde el respaldo"));
        h.Factory.Clients[Sonnet] = primary;
        h.Factory.Clients[Sol] = fallback;

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.True(result.IsSuccess);
        Assert.Equal("desde el respaldo", result.Value);
        Assert.Equal(1, primary.Calls);
        Assert.Single(fallback.Calls);
        var row = Assert.Single(h.Recorder.Entries, e => e.Outcome == AiOutcome.Fallback);
        Assert.Equal(Sol, row.Model.Id);
        // Las dos llamadas son de la misma ejecución.
        Assert.Single(h.Recorder.Entries.Select(e => e.RunId).Distinct());
        // Cada cliente que arma el gateway se libera al terminar.
        Assert.Equal([Sonnet, Sol], h.Factory.Created);
        Assert.All(h.Factory.Built, c => Assert.True(c.Disposed));
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task _401_no_usa_el_respaldo()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        h.Factory.Clients[Sonnet] = new ThrowingClient(() => Http(HttpStatusCode.Unauthorized));
        var fallback = new FakeChatClient(Reply("no debería"));
        h.Factory.Clients[Sol] = fallback;

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.ProviderAuth", result.Error.Code);
        Assert.Equal("La clave de Anthropic no es válida o no tiene saldo.", result.Error.Message);
        Assert.Empty(fallback.Calls);
        Assert.DoesNotContain(Sol, h.Factory.Created);
        Assert.All(h.Factory.Built, c => Assert.True(c.Disposed));
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task Tres_fallas_abren_el_circuito_y_va_directo_al_respaldo()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        // La excepción de estado del SDK de Anthropic, como la lanza el cliente real.
        var primary = new ThrowingClient(() => new Anthropic5xxException(new HttpRequestException("caído"))
        {
            StatusCode = HttpStatusCode.BadGateway,
            ResponseBody = "",
        });
        var fallback = new FakeChatClient(Reply("1"), Reply("2"), Reply("3"), Reply("4"), Reply("5"));
        h.Factory.Clients[Sonnet] = primary;
        h.Factory.Clients[Sol] = fallback;

        for (var i = 0; i < 3; i++)
            Assert.True((await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default)).IsSuccess);
        Assert.Equal(3, primary.Calls);

        var fourth = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("4", fourth.Value);
        Assert.Equal(3, primary.Calls);
        Assert.Equal(4, fallback.Calls.Count);

        // Pasados los 5 minutos se vuelve a probar el principal.
        h.Clock.Advance(TimeSpan.FromMinutes(5));
        await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);
        Assert.Equal(4, primary.Calls);
    }

    [Fact]
    public async Task Circuito_abierto_sin_respaldo_devuelve_Unavailable_sin_llamar()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet);
        var primary = new ThrowingClient(() => Http(HttpStatusCode.TooManyRequests));
        h.Factory.Clients[Sonnet] = primary;

        for (var i = 0; i < 3; i++)
            Assert.Equal("Ai.Unavailable", (await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default)).Error.Code);
        var fourth = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal("Ai.Unavailable", fourth.Error.Code);
        Assert.Equal(ErrorType.Unavailable, fourth.Error.Type);
        Assert.Equal(3, primary.Calls);
    }

    [Fact]
    public async Task Timeout_devuelve_TimedOut()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet);
        var hanging = new HangingClient();
        h.Factory.Clients[Sonnet] = hanging;

        var run = h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);
        await hanging.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        h.Clock.Advance(AiTaskSpecs.For(AiTask.ShortText).Timeout);
        var result = await run.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal("Ai.TimedOut", result.Error.Code);
        Assert.Equal(ErrorType.Unavailable, result.Error.Type);
        Assert.All(h.Factory.Built, c => Assert.True(c.Disposed));
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task Cancelar_el_pedido_no_es_una_falla_del_proveedor()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        var hanging = new HangingClient();
        h.Factory.Clients[Sonnet] = hanging;
        h.Factory.Clients[Sol] = new FakeChatClient(Reply("no debería"));
        // A una falla de abrirse: si la cancelación contara, lo abriría.
        h.Breaker.RecordFailure(Tenant, AiProvider.Anthropic);
        h.Breaker.RecordFailure(Tenant, AiProvider.Anthropic);
        using var cts = new CancellationTokenSource();

        var run = h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, cts.Token);
        await hanging.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => run.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.DoesNotContain(Sol, h.Factory.Created);
        Assert.False(h.Breaker.IsOpen(Tenant, AiProvider.Anthropic));
        await AssertOnlyRealSpendCommitted(h);
    }

    public static TheoryData<string, string> SdkErrors() => new()
    {
        // caso, código esperado (Ok = respondió el respaldo)
        { "google-500", "Ok" },
        { "google-429", "Ok" },
        { "google-sin-respuesta", "Ok" },
        { "google-403", "Ai.ProviderAuth" },
        { "anthropic-401", "Ai.ProviderAuth" },
        { "anthropic-red", "Ok" },
        { "google-400-clave", "Ai.ProviderAuth" },
        { "google-400-otro", "Ai.Rejected" },
        { "anthropic-400-saldo", "Ai.ProviderAuth" },
        { "anthropic-400-largo", "Ai.Rejected" },
        { "anthropic-datos-invalidos", "Ok" },
        { "openai-401", "Ai.ProviderAuth" },
        { "openai-429", "Ok" },
        { "openai-500", "Ok" },
        { "openai-400-clave", "Ai.ProviderAuth" },
        { "openai-400-otro", "Ai.Rejected" },
        { "openai-sin-respuesta", "Ok" },
        { "http-sin-estado", "Ok" },
        { "http-404", "Ai.Rejected" },
        { "timeout-del-httpclient", "Ok" },
    };

    private static Exception SdkError(string kind) => kind switch
    {
        "google-500" => new Google.GenAI.ServerError("caído", 500, "INTERNAL", null),
        "google-429" => new Google.GenAI.ClientError("cuota", 429, "RESOURCE_EXHAUSTED", null),
        "google-sin-respuesta" => new Google.GenAI.ApiException("sin respuesta", new HttpRequestException("red")),
        "google-403" => new Google.GenAI.ClientError("clave", 403, "PERMISSION_DENIED", null),
        "anthropic-401" => new AnthropicUnauthorizedException(new HttpRequestException("clave"))
        {
            StatusCode = HttpStatusCode.Unauthorized,
            ResponseBody = "",
        },
        "anthropic-red" => new AnthropicIOException("red", new HttpRequestException("red")),
        "google-400-clave" => new Google.GenAI.ClientError("API key not valid. Please pass a valid API key.", 400, "INVALID_ARGUMENT", null),
        "google-400-otro" => new Google.GenAI.ClientError("The input token count exceeds the maximum.", 400, "INVALID_ARGUMENT", null),
        "anthropic-400-saldo" => new AnthropicBadRequestException(new HttpRequestException("400"))
        {
            StatusCode = HttpStatusCode.BadRequest,
            ErrorType = Anthropic.Models.ErrorType.InvalidRequestError,
            ResponseBody = """{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}""",
        },
        "anthropic-400-largo" => new AnthropicBadRequestException(new HttpRequestException("400"))
        {
            StatusCode = HttpStatusCode.BadRequest,
            ErrorType = Anthropic.Models.ErrorType.InvalidRequestError,
            ResponseBody = """{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 250000 tokens > 200000 maximum"}}""",
        },
        "anthropic-datos-invalidos" => new AnthropicInvalidDataException("respuesta ilegible", new FormatException()),
        "openai-401" => OpenAi(401, """{"error":{"code":"invalid_api_key"}}"""),
        "openai-429" => OpenAi(429, """{"error":{"code":"rate_limit_exceeded"}}"""),
        "openai-500" => OpenAi(500, """{"error":{"code":"server_error"}}"""),
        "openai-400-clave" => OpenAi(400, """{"error":{"message":"Incorrect API key provided.","code":"invalid_api_key"}}"""),
        "openai-400-otro" => OpenAi(400, """{"error":{"message":"This model's maximum context length is 128000 tokens.","code":"context_length_exceeded"}}"""),
        "openai-sin-respuesta" => new ClientResultException("sin respuesta", null, new HttpRequestException("red")),
        "http-sin-estado" => new HttpRequestException("red"),
        "http-404" => Http(HttpStatusCode.NotFound),
        "timeout-del-httpclient" => new TaskCanceledException("timeout", new TimeoutException()),
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    /// <summary>La excepción de estado de OpenAI y Groq, con la respuesta como la arma el SDK.</summary>
    private static ClientResultException OpenAi(int status, string body) =>
        new($"HTTP {status}", new FakeResponse(status, body));

    private sealed class FakeResponse(int status, string body) : PipelineResponse
    {
        private Stream? _stream = new MemoryStream(Encoding.UTF8.GetBytes(body));

        public override int Status => status;
        public override string ReasonPhrase => "";
        protected override PipelineResponseHeaders HeadersCore { get; } = new NoHeaders();

        public override Stream? ContentStream
        {
            get => _stream;
            set => _stream = value;
        }

        public override BinaryData Content => BinaryData.FromString(body);
        public override BinaryData BufferContent(CancellationToken cancellationToken = default) => Content;
        public override ValueTask<BinaryData> BufferContentAsync(CancellationToken cancellationToken = default) => new(Content);
        public override void Dispose() => _stream?.Dispose();
    }

    private sealed class NoHeaders : PipelineResponseHeaders
    {
        public override bool TryGetValue(string name, out string? value)
        {
            value = null;
            return false;
        }

        public override bool TryGetValues(string name, out IEnumerable<string>? values)
        {
            values = null;
            return false;
        }

        public override IEnumerator<KeyValuePair<string, string>> GetEnumerator() =>
            Enumerable.Empty<KeyValuePair<string, string>>().GetEnumerator();
    }

    [Theory]
    [MemberData(nameof(SdkErrors))]
    public async Task Reconoce_el_estado_de_cada_SDK(string kind, string expected)
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        h.Factory.Clients[Sonnet] = new ThrowingClient(() => SdkError(kind));
        h.Factory.Clients[Sol] = new FakeChatClient(Reply("respaldo"));

        var result = await h.Gateway().RunAsync(AiTask.ShortText, Small, AskAsync, default);

        Assert.Equal(expected, result.IsSuccess ? "Ok" : result.Error.Code);
        // Lo que no es una caída del proveedor no pasa al respaldo.
        if (expected != "Ok") Assert.DoesNotContain(Sol, h.Factory.Created);
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public async Task Un_error_que_no_es_del_proveedor_se_relanza_y_libera_el_cliente()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet, Sol);
        h.Factory.Clients[Sonnet] = new FakeChatClient(Reply("hola"));
        h.Factory.Clients[Sol] = new FakeChatClient(Reply("no debería"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => h.Gateway().RunAsync<string>(
            AiTask.ShortText, Small, (_, _) => throw new InvalidOperationException("bug del cuerpo"), default));

        Assert.Equal([Sonnet], h.Factory.Created);
        Assert.All(h.Factory.Built, c => Assert.True(c.Disposed));
        await AssertOnlyRealSpendCommitted(h);
    }

    [Fact]
    public void Errores_de_IA_no_son_500()
    {
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, Status(AiErrors.Unavailable));
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, Status(AiErrors.TimedOut));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.Budget));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.Disabled));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.NotConfigured));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.Busy));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.Rejected));
        Assert.Equal(StatusCodes.Status409Conflict, Status(AiErrors.BadKey(AiProvider.OpenAI)));

        static int? Status(Error error) => Assert.IsType<ProblemHttpResult>(error.ToProblem()).StatusCode;
    }

    // ---- Lo que recibe el cuerpo ----

    [Fact]
    public async Task WithTools_corta_en_MaxIterations()
    {
        var spec = AiTaskSpecs.For(AiTask.DataAssistant);
        var h = new Harness().Assign(AiTask.DataAssistant, Sonnet);
        var script = Enumerable.Range(0, spec.MaxIterations + 5)
            .Select(i => new ChatResponse(new ChatMessage(ChatRole.Assistant,
                [new FunctionCallContent($"call-{i}", "buscar_ventas")])))
            .ToArray();
        var model = new FakeChatClient(script);
        h.Factory.Clients[Sonnet] = model;
        var tool = AIFunctionFactory.Create(() => "sin resultados", "buscar_ventas", "Busca ventas.");

        var result = await h.Gateway().RunAsync(AiTask.DataAssistant, Small, async (ctx, ct) =>
        {
            var options = ctx.NewOptions();
            options.Tools = [tool];
            return await ctx.WithTools().GetResponseAsync([new(ChatRole.User, "¿cuánto vendí?")], options, ct);
        }, default);

        Assert.True(result.IsSuccess);
        Assert.Equal(spec.MaxIterations, model.Calls.Count);
        Assert.Equal(spec.MaxIterations, h.Recorder.Entries.Count);
        // La última vuelta va sin herramientas: el modelo contesta con lo que tiene.
        Assert.Null(model.Options[^1]?.Tools);
    }

    [Fact]
    public async Task System_marca_cache_solo_en_Anthropic()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet).Assign(AiTask.CatalogWrite, Sol);
        h.Factory.Clients[Sonnet] = new FakeChatClient();
        h.Factory.Clients[Sol] = new FakeChatClient();
        var gateway = h.Gateway();

        var claude = (await gateway.RunAsync(AiTask.ShortText, Small, (ctx, _) => Task.FromResult(ctx.System("fijo")), default)).Value;
        var openAi = (await gateway.RunAsync(AiTask.CatalogWrite, Small, (ctx, _) => Task.FromResult(ctx.System("fijo")), default)).Value;

        Assert.Equal(ChatRole.System, claude.Role);
        Assert.Null(claude.AuthorName);
        // La marca que pone WithCacheControl del SDK de Anthropic (su lector, GetCacheControl, es interno).
        var marked = Assert.Single(claude.Contents);
        Assert.NotNull(marked.AdditionalProperties);
        Assert.True(marked.AdditionalProperties.TryGetValue("anthropic:cache_control", out var mark));
        Assert.IsType<CacheControlEphemeral>(mark);
        var plain = Assert.Single(openAi.Contents);
        Assert.Equal("fijo", Assert.IsType<TextContent>(plain).Text);
        Assert.True(plain.AdditionalProperties is null || plain.AdditionalProperties.Count == 0);
    }

    [Fact]
    public async Task NewOptions_pone_el_tope_de_salida_y_el_effort_solo_en_Claude()
    {
        var h = new Harness().Assign(AiTask.ShortText, Sonnet).Assign(AiTask.CatalogWrite, Sol);
        h.Factory.Clients[Sonnet] = new FakeChatClient();
        h.Factory.Clients[Sol] = new FakeChatClient();
        var gateway = h.Gateway();

        var claude = (await gateway.RunAsync(AiTask.ShortText, Small, (ctx, _) => Task.FromResult(ctx.NewOptions()), default)).Value;
        var openAi = (await gateway.RunAsync(AiTask.CatalogWrite, Small, (ctx, _) => Task.FromResult(ctx.NewOptions()), default)).Value;

        Assert.Equal(AiTaskSpecs.For(AiTask.ShortText).MaxOutputTokens, claude.MaxOutputTokens);
        Assert.Equal(ReasoningEffort.Low, claude.Reasoning?.Effort);
        Assert.Null(claude.Temperature);
        Assert.Equal(AiTaskSpecs.For(AiTask.CatalogWrite).MaxOutputTokens, openAi.MaxOutputTokens);
        Assert.Null(openAi.Reasoning);
    }

    [Fact]
    public async Task AiRunContexts_arma_un_contexto_para_probar_un_cuerpo()
    {
        var model = new FakeChatClient(Reply("listo"));
        var ctx = AiRunContexts.For(model, AiTask.QuestionDraft);

        var response = await ctx.WithTools().GetResponseAsync([ctx.System("fijo"), new(ChatRole.User, "hola")], ctx.NewOptions());

        Assert.Equal("listo", response.Text);
        Assert.Equal(AiTask.QuestionDraft, ctx.Spec.Task);
        Assert.Equal(Sonnet, ctx.Model.Id);
        Assert.Single(model.Calls);
    }
}
