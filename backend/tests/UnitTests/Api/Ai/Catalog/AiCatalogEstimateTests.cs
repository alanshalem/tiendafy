using Api.Ai;
using Api.Ai.Catalog;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogEstimateTests
{
    private static readonly AiModelInfo Sonnet = AiModelCatalog.Find("claude-sonnet-5-5")!;
    private static readonly AiModelInfo Haiku = AiModelCatalog.Find("claude-haiku-5-5")!;

    [Fact]
    public void Sonnet_y_Haiku_por_producto()
    {
        // Redacción: 2.500 de entrada a 2 USD/M = 5.000 y 700 de salida a 10 USD/M = 7.000 → 12.000.
        // Evaluación: 2.000 a 0,10 USD/M = 200 y 250 a 0,50 USD/M = 125 → 325. Más 10 % de reintentos, hacia arriba.
        Assert.Equal(12_325, AiCost.MicroUsd(Sonnet, 2_500, 0, 700) + AiCost.MicroUsd(Haiku, 2_000, 0, 250));
        Assert.Equal(13_558, AiCatalogEstimate.PerProductMicroUsd(Sonnet, Haiku));
    }

    [Fact]
    public void Peor_caso_por_item_Sonnet_y_Haiku()
    {
        // 2 × (redacción: 2.500 × 2 + 1.500 × 10 = 20.000; evaluación: 2.000 × 0,10 + 400 × 0,50 = 400).
        Assert.Equal(40_800, AiCatalogEstimate.WorstCaseItemMicroUsd(Sonnet, Haiku));
    }

    [Fact]
    public void Un_modelo_mas_caro_cuesta_mas()
    {
        var opus = AiModelCatalog.Find("claude-opus-5-5")!;

        Assert.True(AiCatalogEstimate.PerProductMicroUsd(opus, Haiku) > AiCatalogEstimate.PerProductMicroUsd(Sonnet, Haiku));
        Assert.True(AiCatalogEstimate.WorstCaseItemMicroUsd(opus, Haiku) > AiCatalogEstimate.WorstCaseItemMicroUsd(Sonnet, Haiku));
    }
}
