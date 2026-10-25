using Ai.Infrastructure;
using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiCostTests
{
    [Fact]
    public void Sonnet_1M_entrada_y_1M_salida_cuesta_12_dolares()
    {
        var sonnet = AiModelCatalog.Find("claude-sonnet-5-5")!;

        Assert.Equal(12_000_000, AiCost.MicroUsd(sonnet, 1_000_000, 0, 1_000_000));
    }

    [Fact]
    public void Cacheados_se_cobran_a_precio_de_cache()
    {
        var sonnet = AiModelCatalog.Find("claude-sonnet-5-5")!;

        // Precio de lectura de caché de Sonnet 5.5: 0,10 USD por millón (0,05x la entrada).
        Assert.Equal(100_000, AiCost.MicroUsd(sonnet, 0, 1_000_000, 0));
    }

    [Fact]
    public void Redondea_hacia_arriba()
    {
        var haiku = AiModelCatalog.Find("claude-haiku-5-5")!;

        Assert.Equal(1, AiCost.MicroUsd(haiku, 1, 0, 0));
        Assert.Equal(0, AiCost.MicroUsd(haiku, 0, 0, 0));
    }

    [Fact]
    public void WorstCase_DataAssistant()
    {
        var sonnet = AiModelCatalog.Find("claude-sonnet-5-5")!;
        var spec = AiTaskSpecs.For(AiTask.DataAssistant);

        Assert.Equal(6 * (5_000 * 2 + 1_500 * 10), AiCost.WorstCaseMicroUsd(sonnet, spec, 5_000));
    }
}
