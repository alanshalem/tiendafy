using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai;

public sealed class MeteringChatClientTests
{
    private static readonly Guid Tenant = Guid.NewGuid();
    private static readonly List<ChatMessage> Hi = [new(ChatRole.User, "hola")];

    private sealed class FakeRecorder : IAiUsageRecorder
    {
        public List<AiUsageEntry> Entries { get; } = [];

        public Task RecordAsync(AiUsageEntry entry, CancellationToken ct)
        {
            Entries.Add(entry);
            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingClient : IChatClient
    {
        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new HttpRequestException("503");

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public object? GetService(Type serviceType, object? serviceKey = null) => null;

        public void Dispose() { }
    }

    private sealed class FixedSpend(long spent) : IAiMonthSpend
    {
        public Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct) => Task.FromResult(spent);
    }

    private static AiUsageEntry Template(string modelId) => new(
        Tenant, null, AiTask.CatalogWrite, AiModelCatalog.Find(modelId)!, Guid.NewGuid(), 0, 0, 0, AiOutcome.Ok);

    private static ChatResponse Reply(UsageDetails? usage) =>
        new(new ChatMessage(ChatRole.Assistant, "ok")) { Usage = usage };

    [Fact]
    public async Task Registra_una_fila_por_respuesta()
    {
        var recorder = new FakeRecorder();
        var inner = new FakeChatClient(
            Reply(new UsageDetails { InputTokenCount = 10, OutputTokenCount = 5 }),
            Reply(new UsageDetails { InputTokenCount = 20, OutputTokenCount = 7 }));
        var client = new MeteringChatClient(inner, recorder, Template("claude-sonnet-5-5"), null);

        await client.GetResponseAsync(Hi);
        await client.GetResponseAsync(Hi);

        Assert.Equal(2, recorder.Entries.Count);
        Assert.Equal([10L, 20L], recorder.Entries.Select(e => e.InputTokens));
        Assert.Equal([5L, 7L], recorder.Entries.Select(e => e.OutputTokens));
        Assert.All(recorder.Entries, e => Assert.Equal(AiOutcome.Ok, e.Outcome));
    }

    [Fact]
    public async Task Resta_los_cacheados_de_la_entrada()
    {
        var recorder = new FakeRecorder();
        var inner = new FakeChatClient(Reply(new UsageDetails
        {
            InputTokenCount = 1000,
            CachedInputTokenCount = 800,
            OutputTokenCount = 50,
        }));

        await new MeteringChatClient(inner, recorder, Template("gpt-6-luna"), null).GetResponseAsync(Hi);

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(200, entry.InputTokens);
        Assert.Equal(800, entry.CachedInputTokens);
    }

    [Fact]
    public async Task Suma_escritura_de_cache_de_Anthropic()
    {
        var recorder = new FakeRecorder();
        var inner = new FakeChatClient(Reply(new UsageDetails
        {
            InputTokenCount = 1000,
            CachedInputTokenCount = 0,
            OutputTokenCount = 50,
            AdditionalCounts = new AdditionalPropertiesDictionary<long> { ["CacheCreationInputTokens"] = 300 },
        }));

        await new MeteringChatClient(inner, recorder, Template("claude-sonnet-5-5"), null).GetResponseAsync(Hi);

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(1300, entry.InputTokens);
        Assert.Equal(0, entry.CachedInputTokens);
    }

    [Fact]
    public async Task Informa_el_costo_a_la_reserva()
    {
        var budget = new AiBudget(new FixedSpend(0), TimeProvider.System);
        await using var reservation = (await budget.TryReserveAsync(Tenant, 100_000_000, 10_000_000, default))!;
        var sonnet = AiModelCatalog.Find("claude-sonnet-5-5")!;
        var inner = new FakeChatClient(Reply(new UsageDetails { InputTokenCount = 1000, OutputTokenCount = 500 }));

        await new MeteringChatClient(inner, new FakeRecorder(), Template("claude-sonnet-5-5"), reservation).GetResponseAsync(Hi);

        var expected = AiCost.MicroUsd(sonnet, 1000, 0, 500);
        Assert.True(expected > 0);
        // Lo reservado más lo real ya informado.
        Assert.Equal(10_000_000 + expected, await budget.CommittedMicroUsdAsync(Tenant, default));
    }

    [Fact]
    public async Task Un_error_del_proveedor_queda_registrado_y_se_relanza()
    {
        var recorder = new FakeRecorder();
        var client = new MeteringChatClient(new ThrowingClient(), recorder, Template("claude-sonnet-5-5"), null);

        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetResponseAsync(Hi));

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(AiOutcome.Error, entry.Outcome);
        Assert.Equal(0, entry.InputTokens);
        Assert.Equal(0, entry.OutputTokens);
    }

    [Fact]
    public async Task Una_respuesta_sin_uso_registra_cero()
    {
        var recorder = new FakeRecorder();
        var client = new MeteringChatClient(new FakeChatClient(Reply(null)), recorder, Template("claude-sonnet-5-5"), null);

        await client.GetResponseAsync(Hi);

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(0, entry.InputTokens);
        Assert.Equal(0, entry.OutputTokens);
        Assert.Equal(AiOutcome.Ok, entry.Outcome);
    }
}
