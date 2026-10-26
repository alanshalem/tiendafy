using Api.Meli;

namespace UnitTests.Meli;

public sealed class MeliAttributeSelectionTests
{
    private static MeliCategoryAttribute Attr(string id, bool required = false, bool relevant = false) =>
        new(id, id, MeliAttributeKind.Text, [], [], null, null, required, relevant, false);

    private static readonly HashSet<string> Nothing = [];

    [Fact]
    public void Deja_solo_obligatorios_y_relevantes()
    {
        var asked = MeliAttributeSelection.ToAsk(
            [Attr("COMUN"), Attr("RELEVANTE", relevant: true), Attr("OBLIGATORIO", required: true)], Nothing);

        Assert.Equal(["OBLIGATORIO", "RELEVANTE"], asked.Select(a => a.Id));
    }

    [Fact]
    public void Saca_los_ya_cargados_y_SELLER_SKU()
    {
        var asked = MeliAttributeSelection.ToAsk(
            [Attr("BRAND", required: true), Attr("SELLER_SKU", required: true), Attr("MODEL", relevant: true), Attr("COLOR", relevant: true)],
            new HashSet<string> { "BRAND", "color" });

        Assert.Equal(["MODEL"], asked.Select(a => a.Id));
    }

    [Fact]
    public void Corta_en_40_con_los_obligatorios_primero()
    {
        var category = Enumerable.Range(0, 60).Select(i => Attr($"REL{i}", relevant: true))
            .Concat(Enumerable.Range(0, 5).Select(i => Attr($"REQ{i}", required: true)))
            .ToList();

        var asked = MeliAttributeSelection.ToAsk(category, Nothing);

        Assert.Equal(MeliAttributeSelection.MaxAsked, asked.Count);
        Assert.Equal(40, asked.Count);
        Assert.All(asked.Take(5), a => Assert.True(a.Required));
        // Después de los obligatorios, el orden de ML.
        Assert.Equal("REL0", asked[5].Id);
        Assert.Equal("REL34", asked[^1].Id);
    }
}
