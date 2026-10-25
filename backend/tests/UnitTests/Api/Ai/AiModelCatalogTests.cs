using Ai.Infrastructure;
using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiModelCatalogTests
{
    private static readonly IReadOnlySet<AiProvider> GroqYAnthropic =
        new HashSet<AiProvider> { AiProvider.Groq, AiProvider.Anthropic };

    [Fact]
    public void InvoiceRead_solo_ofrece_modelos_con_Pdf()
    {
        var elegibles = AiModelCatalog.Eligible(AiTask.InvoiceRead, GroqYAnthropic).ToList();

        Assert.NotEmpty(elegibles);
        Assert.DoesNotContain(elegibles, m => m.Provider == AiProvider.Groq);
        Assert.All(elegibles, m => Assert.True(m.Capabilities.HasFlag(AiCapability.Pdf)));
    }

    [Fact]
    public void Groq_es_elegible_para_DataAssistant()
    {
        Assert.Equal(AiCapability.Tools, AiTaskSpecs.For(AiTask.DataAssistant).Requires);

        var elegibles = AiModelCatalog.Eligible(AiTask.DataAssistant, GroqYAnthropic).ToList();

        Assert.Contains(elegibles, m => m.Provider == AiProvider.Groq);
    }

    [Fact]
    public void Sin_clave_del_proveedor_no_hay_modelos_de_ese_proveedor()
    {
        var elegibles = AiModelCatalog.Eligible(AiTask.ShortText, new HashSet<AiProvider> { AiProvider.Google });

        Assert.NotEmpty(elegibles);
        Assert.All(elegibles, m => Assert.Equal(AiProvider.Google, m.Provider));
    }

    [Fact]
    public void Todas_las_tareas_tienen_spec()
    {
        foreach (var task in Enum.GetValues<AiTask>())
            Assert.Equal(task, AiTaskSpecs.For(task).Task);
        Assert.Equal(Enum.GetValues<AiTask>().Length, AiTaskSpecs.All.Count);
    }

    [Fact]
    public void Todos_los_ids_son_unicos()
    {
        var ids = AiModelCatalog.All.Select(m => m.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    [Fact]
    public void Cada_proveedor_tiene_un_modelo_para_probar_conexion()
    {
        foreach (var provider in Enum.GetValues<AiProvider>())
            Assert.Equal(provider, AiModelCatalog.CheapestOf(provider).Provider);
        Assert.Equal("claude-haiku-5-5", AiModelCatalog.CheapestOf(AiProvider.Anthropic).Id);
    }

    [Fact]
    public void Find_devuelve_null_si_el_modelo_no_existe()
    {
        Assert.Null(AiModelCatalog.Find("no-existe"));
    }
}
