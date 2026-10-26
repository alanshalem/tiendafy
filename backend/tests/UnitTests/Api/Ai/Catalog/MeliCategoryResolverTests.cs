using Api.Meli;
using MercadoLibre.Infrastructure;

namespace UnitTests.Api.Ai.Catalog;

public sealed class MeliCategoryResolverTests
{
    private static MeliCategorySuggestion Suggestion(string id, string name) => new(id, name, "Dominio");

    [Fact]
    public void Una_sugerencia_es_clara()
    {
        var result = MeliCategoryResolver.FromPrediction([Suggestion("MLA1", "Taladros")]);

        var resolved = Assert.IsType<MeliCategoryResolution.Resolved>(result);
        Assert.Equal(new MeliCategoryRef("MLA1", "Taladros"), resolved.Category);
        Assert.Equal(MeliCategorySource.Predicted, resolved.Source);
    }

    [Fact]
    public void Tres_con_el_mismo_nombre_es_clara()
    {
        var result = MeliCategoryResolver.FromPrediction(
            [Suggestion("MLA1", "Taladros"), Suggestion("MLA2", "taladros"), Suggestion("MLA3", "Taladros")]);

        var resolved = Assert.IsType<MeliCategoryResolution.Resolved>(result);
        Assert.Equal("MLA1", resolved.Category.Id);
    }

    [Fact]
    public void Dos_nombres_distintos_es_Unclear()
    {
        var result = MeliCategoryResolver.FromPrediction([Suggestion("MLA1", "Taladros"), Suggestion("MLA2", "Atornilladores")]);

        var unclear = Assert.IsType<MeliCategoryResolution.Unclear>(result);
        Assert.Equal(2, unclear.Suggestions.Count);
    }

    [Fact]
    public void Ninguna_es_Unclear_vacia()
    {
        var result = MeliCategoryResolver.FromPrediction([]);

        Assert.Empty(Assert.IsType<MeliCategoryResolution.Unclear>(result).Suggestions);
    }
}
