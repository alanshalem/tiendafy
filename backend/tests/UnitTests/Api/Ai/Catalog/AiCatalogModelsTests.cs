using Ai.Infrastructure;
using Api.Ai;
using Api.Ai.Catalog;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogModelsTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static ChatResponse Turn(params ChatMessage[] messages) => new(messages);

    /// <summary>Ejecuta el cuerpo contra el cliente falso, sin presupuesto ni respaldo.</summary>
    private sealed class DirectGateway(FakeChatClient client) : IAiGateway
    {
        public AiTask? RanTask { get; private set; }
        public AiRunOptions? Options { get; private set; }
        public Guid RunId { get; private set; }
        public Error? Fail { get; init; }

        public Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct) => throw new NotSupportedException();

        public async Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
            Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)
        {
            RanTask = task;
            Options = options;
            if (Fail is { } error) return Result.Failure<T>(error);
            var context = AiRunContexts.For(client, task);
            RunId = context.RunId;
            return Result.Success(await body(context, ct));
        }
    }

    [Fact]
    public async Task Redactar_va_a_CatalogWrite_con_esquema_y_sin_herramientas()
    {
        var client = new FakeChatClient(Turn(new ChatMessage(ChatRole.Assistant, "  {\"ok\":true}  ")));
        var gateway = new DirectGateway(client);

        var result = await new AiCatalogModels(gateway).WriteAsync("datos del producto", TenantId, UserId, default);

        Assert.Equal(AiTask.CatalogWrite, gateway.RanTask);
        Assert.Equal("{\"ok\":true}", result.Value.Text);
        Assert.Equal(gateway.RunId, result.Value.RunId);
        Assert.Equal(TenantId, gateway.Options!.TenantId);
        Assert.Equal(UserId, gateway.Options.UserId);
        Assert.Equal(AiCatalogPrompts.EstimateInputTokens(AiCatalogPrompts.WriteSystem, "datos del producto"), gateway.Options.EstimatedInputTokens);

        var messages = Assert.Single(client.Calls);
        Assert.Equal(ChatRole.System, messages[0].Role);
        Assert.Equal(AiCatalogPrompts.WriteSystem, messages[0].Text);
        Assert.Equal("datos del producto", messages[1].Text);
        var options = Assert.Single(client.Options)!;
        Assert.IsType<ChatResponseFormatJson>(options.ResponseFormat);
        Assert.Null(options.Tools);
        Assert.Equal(AiTaskSpecs.For(AiTask.CatalogWrite).MaxOutputTokens, options.MaxOutputTokens);
    }

    [Fact]
    public async Task Evaluar_va_a_CatalogJudge()
    {
        var client = new FakeChatClient(Turn(new ChatMessage(ChatRole.Assistant, "{}")));
        var gateway = new DirectGateway(client);

        await new AiCatalogModels(gateway).JudgeAsync("ficha", TenantId, UserId, default);

        Assert.Equal(AiTask.CatalogJudge, gateway.RanTask);
        Assert.Equal(AiCatalogPrompts.JudgeSystem, Assert.Single(client.Calls)[0].Text);
    }

    [Fact]
    public async Task El_texto_es_el_ultimo_mensaje_del_asistente()
    {
        var client = new FakeChatClient(Turn(
            new ChatMessage(ChatRole.Assistant, "Voy a armar la ficha."),
            new ChatMessage(ChatRole.Assistant, "{\"final\":1}")));

        var result = await new AiCatalogModels(new DirectGateway(client)).WriteAsync("x", TenantId, UserId, default);

        Assert.Equal("{\"final\":1}", result.Value.Text);
    }

    [Fact]
    public async Task Los_errores_del_gateway_vuelven_tal_cual()
    {
        var gateway = new DirectGateway(new FakeChatClient()) { Fail = AiErrors.Budget };

        var result = await new AiCatalogModels(gateway).WriteAsync("x", TenantId, UserId, default);

        Assert.True(result.IsFailure);
        Assert.Same(AiErrors.Budget, result.Error);
    }
}
