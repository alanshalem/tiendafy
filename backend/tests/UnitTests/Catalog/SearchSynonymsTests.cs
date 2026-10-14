using Catalog.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Catalog;

public class SearchSynonymsTests
{
    private static readonly IReadOnlyList<IReadOnlyList<string>> Groups =
    [
        ["mancuerna", "dumbbell"],
        ["pesa rusa", "kettlebell"],
        ["cinta", "tape"],
        ["cinta de correr", "treadmill"],
    ];

    private static List<List<string>> Slots(string text) =>
        [.. SearchSynonyms.Expand(text, Groups).Select(s => s.ToList())];

    [Fact]
    public void Sin_sinonimos_cada_palabra_es_un_lugar()
    {
        var slots = SearchSynonyms.Expand("remera roja", null);
        Assert.Equal([["remera"], ["roja"]], slots.Select(s => s.ToList()).ToList());
        Assert.Empty(SearchSynonyms.Expand("   ", Groups));
    }

    [Fact]
    public void Una_palabra_del_grupo_trae_al_grupo_entero_sin_tildes_ni_mayusculas()
    {
        Assert.Equal([["MANCUERNA", "dumbbell"]], Slots("MANCUERNA"));
        Assert.Equal([["Dumbbell", "mancuerna"]], Slots("Dumbbell"));
    }

    [Fact]
    public void El_plural_tambien_encuentra_el_grupo()
    {
        Assert.Equal([["mancuernas", "mancuerna", "dumbbell"], ["5kg"]], Slots("mancuernas 5kg"));
        Assert.Equal([["pesas rusas", "pesa rusa", "kettlebell"]], Slots("pesas rusas"));
    }

    [Fact]
    public void Un_termino_de_varias_palabras_cuenta_como_uno_y_gana_el_mas_largo()
    {
        Assert.Equal([["pesa rusa", "kettlebell"], ["12"]], Slots("pesa rusa 12"));
        Assert.Equal([["cinta de correr", "treadmill"]], Slots("cinta de correr"));
        Assert.Equal([["cinta", "tape"], ["roja"]], Slots("cinta roja"));
    }

    [Fact]
    public void Normalizar_saca_tildes_mayusculas_y_espacios_de_mas()
    {
        Assert.Equal("proteina en polvo", SearchSynonyms.Normalize("  Proteína   EN polvo "));
        Assert.Equal("cana", SearchSynonyms.Normalize("Caña"));
        Assert.Equal(string.Empty, SearchSynonyms.Normalize(null));
    }

    [Fact]
    public void Limpiar_descarta_grupos_de_uno_y_repetidos_y_separa_por_coma()
    {
        var cleaned = SearchSynonyms.Clean(
        [
            ["Mancuerna, Dumbbell", "mancuerna", "  DUMBBELL "],
            ["solo"],
            ["Proteína", "proteina", "whey"],
            null,
        ]);

        Assert.True(cleaned.IsSuccess);
        Assert.Equal([["mancuerna", "dumbbell"], ["proteína", "whey"]], cleaned.Value.Select(g => g.ToList()).ToList());
    }

    [Fact]
    public void Limpiar_rechaza_listas_gigantes()
    {
        var tooManyTerms = SearchSynonyms.Clean([Enumerable.Range(0, SearchSynonyms.MaxTermsPerGroup + 1).Select(i => $"t{i}")]);
        Assert.True(tooManyTerms.IsFailure);

        var tooLong = SearchSynonyms.Clean([["a", new string('x', SearchSynonyms.MaxTermLength + 1)]]);
        Assert.True(tooLong.IsFailure);

        var tooManyGroups = SearchSynonyms.Clean(Enumerable.Range(0, SearchSynonyms.MaxGroups + 1).Select(i => new[] { $"a{i}", $"b{i}" }));
        Assert.True(tooManyGroups.IsFailure);
    }

    [Fact]
    public void La_configuracion_guarda_los_grupos_limpios()
    {
        var settings = new SearchSettings(TenantId.From(Guid.NewGuid()));
        Assert.True(settings.SetSynonyms([["Pesa Rusa", "kettlebell"]]).IsSuccess);
        Assert.Equal([["pesa rusa", "kettlebell"]], settings.SynonymGroups.Select(g => g.ToList()).ToList());

        Assert.True(settings.SetSynonyms([["x", new string('y', 200)]]).IsFailure);
        Assert.Single(settings.SynonymGroups); // lo inválido no pisa lo anterior
    }

    [Fact]
    public void Los_de_fabrica_son_validos()
    {
        var cleaned = SearchSynonyms.Clean(SearchSynonyms.Defaults);
        Assert.True(cleaned.IsSuccess);
        Assert.Equal(SearchSynonyms.Defaults.Count, cleaned.Value.Count);
    }
}
