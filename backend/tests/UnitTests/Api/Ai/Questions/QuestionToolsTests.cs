using Api.Ai.Questions;
using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai.Questions;

public sealed class QuestionToolsTests
{
    private static readonly DraftChannel[] Channels = Enum.GetValues<DraftChannel>();
    private static readonly QuestionCategory[] Categories = Enum.GetValues<QuestionCategory>();

    private static DraftReaders Readers(Action? onStock = null) => new(
        StockAndPrice: _ => { onStock?.Invoke(); return Task.FromResult("$ 15.000 · 3 disponibles"); },
        TechSheet: _ => Task.FromResult("Color: negro"),
        OrderStatus: _ => Task.FromResult("Pagado, preparando"),
        Tracking: _ => Task.FromResult(new TrackingInfo("En camino", false)));

    private static string[] Names(DraftChannel channel, QuestionCategory category, DraftReaders? readers = null) =>
        QuestionTools.For(channel, category, readers ?? Readers(), new DraftToolLog()).Select(t => t.Name).ToArray();

    [Theory]
    [InlineData(QuestionCategory.Stock)]
    [InlineData(QuestionCategory.Price)]
    public void Preventa_stock_solo_da_stock_y_precio(QuestionCategory category) =>
        Assert.Equal(["stock_y_precio"], Names(DraftChannel.MeliQuestion, category));

    [Fact]
    public void Preventa_producto_da_ficha_tecnica() =>
        Assert.Equal(["ficha_tecnica"], Names(DraftChannel.MeliQuestion, QuestionCategory.Product));

    [Fact]
    public void Preventa_envio_no_da_herramientas() =>
        Assert.Empty(Names(DraftChannel.MeliQuestion, QuestionCategory.Shipping));

    [Fact]
    public void Contacto_nunca_da_herramientas()
    {
        foreach (var category in Categories)
            Assert.Empty(Names(DraftChannel.Contact, category));
    }

    [Theory]
    [InlineData(DraftChannel.MeliMessage)]
    [InlineData(DraftChannel.SupportChat)]
    public void Posventa_postventa_da_estado_y_seguimiento(DraftChannel channel) =>
        Assert.Equal(["estado_del_pedido", "seguimiento"], Names(channel, QuestionCategory.AfterSale));

    [Theory]
    [InlineData(DraftChannel.MeliMessage)]
    [InlineData(DraftChannel.SupportChat)]
    public void Posventa_envio_da_seguimiento_y_otro_da_estado(DraftChannel channel)
    {
        Assert.Equal(["seguimiento"], Names(channel, QuestionCategory.Shipping));
        Assert.Equal(["estado_del_pedido"], Names(channel, QuestionCategory.Other));
        Assert.Empty(Names(channel, QuestionCategory.OutOfPolicy));
    }

    [Fact]
    public void Lector_nulo_no_ofrece_la_herramienta() =>
        Assert.Equal(["seguimiento"],
            Names(DraftChannel.SupportChat, QuestionCategory.AfterSale, Readers() with { OrderStatus = null }));

    [Fact]
    public void Ninguna_herramienta_tiene_parametros()
    {
        var any = false;
        foreach (var channel in Channels)
            foreach (var category in Categories)
                foreach (var tool in QuestionTools.For(channel, category, Readers(), new DraftToolLog()))
                {
                    any = true;
                    var schema = tool.JsonSchema;
                    var hasProps = schema.TryGetProperty("properties", out var props) && props.EnumerateObject().Any();
                    Assert.False(hasProps, $"{tool.Name} ({channel}/{category}) declara parámetros: {schema}");
                }
        Assert.True(any);
    }

    [Fact]
    public async Task Ignora_los_argumentos_del_modelo()
    {
        var calls = 0;
        var tool = QuestionTools.For(DraftChannel.MeliQuestion, QuestionCategory.Stock, Readers(() => calls++), new DraftToolLog()).Single();

        var result = await tool.InvokeAsync(new AIFunctionArguments { ["itemId"] = "MLA999" });

        Assert.Contains("$ 15.000 · 3 disponibles", result?.ToString());
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Recorta_el_resultado()
    {
        var readers = new DraftReaders(StockAndPrice: _ => Task.FromResult(new string('x', 5_000)));
        var tool = QuestionTools.For(DraftChannel.MeliQuestion, QuestionCategory.Stock, readers, new DraftToolLog()).Single();

        var result = (await tool.InvokeAsync())?.ToString() ?? "";

        Assert.InRange(result.Length, 1, QuestionTools.MaxResultChars);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Seguimiento_con_fecha_lo_anota(bool hasEstimate)
    {
        var log = new DraftToolLog();
        var readers = new DraftReaders(Tracking: _ => Task.FromResult(new TrackingInfo("Llega el lunes", hasEstimate)));
        var tool = QuestionTools.For(DraftChannel.SupportChat, QuestionCategory.Shipping, readers, log).Single();

        await tool.InvokeAsync();

        Assert.Equal(hasEstimate, log.DeliveryEstimateKnown);
    }

    [Fact]
    public void AllowanceTokens_es_resultado_maximo_sobre_tres() =>
        Assert.Equal(2 * QuestionTools.MaxResultChars / 3, QuestionTools.AllowanceTokens(2));

    // ---- Timeout y fallas del lector ----

    private static readonly TimeSpan Fast = TimeSpan.FromMilliseconds(50);

    [Fact]
    public async Task Lector_que_excede_el_timeout_da_texto_neutro_lo_registra_y_no_marca_fecha()
    {
        var log = new DraftToolLog(Fast);
        var readers = new DraftReaders(Tracking: async ct =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return new TrackingInfo("nunca", true);
        });
        var tool = QuestionTools.For(DraftChannel.SupportChat, QuestionCategory.Shipping, readers, log).Single();

        var result = await tool.InvokeAsync();

        Assert.Contains(QuestionTools.Unavailable, result?.ToString());
        Assert.False(log.DeliveryEstimateKnown);
        var failure = Assert.Single(log.ReaderFailures);
        Assert.Equal("seguimiento", failure.Tool);
        Assert.True(failure.TimedOut);
    }

    [Fact]
    public async Task Lector_que_ignora_el_token_igual_se_corta_por_el_tope()
    {
        var log = new DraftToolLog(Fast);
        var readers = new DraftReaders(StockAndPrice: async _ =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), CancellationToken.None);
            return "tarde";
        });
        var tool = QuestionTools.For(DraftChannel.MeliQuestion, QuestionCategory.Stock, readers, log).Single();

        var result = await tool.InvokeAsync();

        Assert.Contains(QuestionTools.Unavailable, result?.ToString());
        Assert.True(Assert.Single(log.ReaderFailures).TimedOut);
    }

    [Fact]
    public async Task Lector_que_lanza_da_texto_neutro_y_registra_herramienta_y_tipo_sin_mensaje()
    {
        var log = new DraftToolLog();
        var readers = new DraftReaders(StockAndPrice: _ => throw new HttpRequestException("ML caído para juan@mail.com"));
        var tool = QuestionTools.For(DraftChannel.MeliQuestion, QuestionCategory.Stock, readers, log).Single();

        var result = await tool.InvokeAsync();

        Assert.Contains(QuestionTools.Unavailable, result?.ToString());
        var failure = Assert.Single(log.ReaderFailures);
        Assert.Equal("stock_y_precio", failure.Tool);
        Assert.Equal(nameof(HttpRequestException), failure.ExceptionType);
        Assert.False(failure.TimedOut);
        Assert.DoesNotContain("juan", failure.ToString());
    }

    [Fact]
    public async Task Fecha_conocida_sobrevive_a_una_segunda_llamada_que_falla()
    {
        var log = new DraftToolLog();
        var calls = 0;
        var readers = new DraftReaders(Tracking: _ => ++calls == 1
            ? Task.FromResult(new TrackingInfo("Llega el lunes", true))
            : throw new HttpRequestException("caído"));
        var tool = QuestionTools.For(DraftChannel.SupportChat, QuestionCategory.Shipping, readers, log).Single();

        await tool.InvokeAsync();
        await tool.InvokeAsync();

        Assert.True(log.DeliveryEstimateKnown);
        Assert.Single(log.ReaderFailures);
    }

    [Fact]
    public async Task Cancelacion_externa_se_propaga_y_no_es_una_falla()
    {
        var log = new DraftToolLog();
        var readers = new DraftReaders(StockAndPrice: async ct =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return "nunca";
        });
        var tool = QuestionTools.For(DraftChannel.MeliQuestion, QuestionCategory.Stock, readers, log).Single();
        using var cts = new CancellationTokenSource();
        cts.CancelAfter(50);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await tool.InvokeAsync(null, cts.Token));
        Assert.Empty(log.ReaderFailures);
    }
}
