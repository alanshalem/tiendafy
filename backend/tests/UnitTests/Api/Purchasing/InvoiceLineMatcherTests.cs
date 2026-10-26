using Api.Purchasing;

namespace UnitTests.Api.Purchasing;

public sealed class InvoiceLineMatcherTests
{
    private static readonly OrderItemRef A = new(Guid.NewGuid(), "REM-001", "Remera algodón Negra M");
    private static readonly OrderItemRef B = new(Guid.NewGuid(), "MAN-10", "Mancuerna hexagonal 10 kg");
    private static readonly OrderItemRef C = new(Guid.NewGuid(), "MAN-12", "Mancuerna hexagonal 12 kg");
    private static readonly OrderItemRef[] Items = [A, B, C];

    private static ScannedInvoiceLine Line(string description, string? code = null) => new(description, code, 1, 100m);

    private static MatchPlan Plan(params ScannedInvoiceLine[] lines) => InvoiceLineMatcher.Plan(lines, Items);

    [Fact]
    public void Normaliza_tildes_unidades_y_signos()
    {
        Assert.Equal("mancuerna hexagonal 10 kg goma", InvoiceLineMatcher.Normalize("Mancuerna HEXAGONAL 10kg — Goma"));
        Assert.Equal("barra olimpica", InvoiceLineMatcher.Normalize("Barra olímpica"));
    }

    [Fact]
    public void Codigo_exacto_gana()
    {
        var match = Plan(Line("Remera lisa", "rem 001")).Matches[0];

        Assert.Equal(A.VariantId, match.VariantId);
        Assert.Equal(LineMatchMethod.Code, match.Method);
        Assert.Equal("alta", match.Confidence);
    }

    [Fact]
    public void SKU_dentro_de_la_descripcion()
    {
        var match = Plan(Line("MAN-12 Mancuerna")).Matches[0];

        Assert.Equal(C.VariantId, match.VariantId);
        Assert.Equal(LineMatchMethod.Code, match.Method);
    }

    [Fact]
    public void Descripcion_clara_empareja_sin_IA()
    {
        var plan = Plan(Line("Mancuerna hexagonal 10kg"));

        Assert.Equal(B.VariantId, plan.Matches[0].VariantId);
        Assert.Equal(LineMatchMethod.Description, plan.Matches[0].Method);
        Assert.Equal("alta", plan.Matches[0].Confidence);
        Assert.Empty(plan.AskAi);
    }

    [Fact]
    public void Descripcion_ambigua_va_a_la_IA()
    {
        var plan = Plan(Line("Mancuerna hexagonal"));

        Assert.Equal([0], plan.AskAi);
        Assert.Equal([B.VariantId, C.VariantId], plan.Matches[0].Candidates);
        Assert.Null(plan.Matches[0].VariantId);
    }

    [Fact]
    public void Ventaja_chica_es_ambigua()
    {
        var plan = Plan(Line("Mancuerna hexagonal kg"));

        Assert.Equal([0], plan.AskAi);
        Assert.Equal(LineMatchMethod.None, plan.Matches[0].Method);
        Assert.Equal([B.VariantId, C.VariantId], plan.Matches[0].Candidates);
    }

    [Fact]
    public void Sin_parecido_no_va_a_la_IA()
    {
        var plan = Plan(Line("Flete internacional"));

        Assert.Equal(LineMatchMethod.None, plan.Matches[0].Method);
        Assert.Equal("baja", plan.Matches[0].Confidence);
        Assert.Empty(plan.Matches[0].Candidates);
        Assert.Empty(plan.AskAi);
    }

    [Fact]
    public void A_la_IA_van_hasta_20()
    {
        var plan = Plan([.. Enumerable.Range(0, 25).Select(_ => Line("Mancuerna hexagonal"))]);

        Assert.Equal(Enumerable.Range(0, 20), plan.AskAi);
        foreach (var rest in plan.Matches.Skip(20))
        {
            Assert.Equal(LineMatchMethod.None, rest.Method);
            Assert.Equal([B.VariantId, C.VariantId], rest.Candidates);
        }
    }
}
