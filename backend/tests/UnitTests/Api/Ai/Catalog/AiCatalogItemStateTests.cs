using Api.Ai.Catalog;
using Api.Meli;
using MercadoLibre.Infrastructure;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogItemStateTests
{
    [Fact]
    public void Estado_ida_y_vuelta_por_JSON()
    {
        var runId = Guid.NewGuid();
        var state = new AiCatalogItemState(
            AiCatalogStep.Judge,
            new MeliCategoryRef("MLA1", "Taladros"),
            MeliCategorySource.Listing,
            [new MeliCategorySuggestion("MLA2", "Atornilladores", "Herramientas")],
            [new MeliCategoryAttribute("COLOR", "Color", MeliAttributeKind.List, [new("52049", "Negro")], ["cm"], "cm", 60, true, true, false)],
            new AiCatalogProposal("Descripción", "Título", "SEO", [new("COLOR", "52049", "Negro", null, false), new("GTIN", null, null, null, true)]),
            ["nota"],
            new AiCatalogJudgeResult(false, 4, 5, true, 4, ["motivo"]),
            ["crítica"],
            true,
            [runId],
            2,
            "razón");

        var back = AiCatalogItemState.FromJson(state.ToJson());

        Assert.Equal(state.ToJson(), back.ToJson());
        Assert.Equal(AiCatalogStep.Judge, back.Step);
        Assert.Equal(new MeliCategoryRef("MLA1", "Taladros"), back.Category);
        Assert.Equal(MeliCategorySource.Listing, back.CategorySource);
        Assert.Equal("MLA2", Assert.Single(back.Suggestions).CategoryId);
        var asked = Assert.Single(back.Asked);
        Assert.Equal(MeliAttributeKind.List, asked.Kind);
        Assert.Equal(new MeliAttributeValue("52049", "Negro"), Assert.Single(asked.Values));
        Assert.Equal(2, back.Proposal!.Attributes.Count);
        Assert.True(back.Proposal.Attributes[1].Missing);
        Assert.Equal(4, back.Judge!.Puntaje);
        Assert.True(back.Judge.Passes);
        Assert.Equal([runId], back.RunIds);
        Assert.Equal(2, back.TransientFailures);
        Assert.Equal("razón", back.FailureReason);
        Assert.True(back.Passed);
    }

    [Fact]
    public void El_paso_se_guarda_como_texto()
    {
        Assert.Contains("\"step\":\"Category\"", AiCatalogItemState.Initial.ToJson());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("esto no es json")]
    [InlineData("{\"step\": \"Inexistente\"}")]
    public void FromJson_de_nada_o_de_algo_roto_es_el_principio(string? json)
    {
        var state = AiCatalogItemState.FromJson(json);

        Assert.Equal(AiCatalogStep.Category, state.Step);
        Assert.Equal(AiCatalogItemState.Initial.ToJson(), state.ToJson());
    }
}
