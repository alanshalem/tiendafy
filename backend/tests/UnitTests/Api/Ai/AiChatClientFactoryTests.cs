using Ai.Infrastructure;
using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiChatClientFactoryTests
{
    [Fact]
    public void Groq_apunta_a_la_url_fija()
    {
        Assert.Equal(new Uri("https://api.groq.com/openai/v1"), AiChatClientFactory.GroqEndpoint);
    }

    [Theory]
    [InlineData(AiProvider.Anthropic)]
    [InlineData(AiProvider.OpenAI)]
    [InlineData(AiProvider.Google)]
    [InlineData(AiProvider.Groq)]
    public void Crea_un_cliente_por_proveedor(AiProvider provider)
    {
        // Crear el cliente no hace ninguna llamada de red: solo arma el objeto.
        var model = AiModelCatalog.CheapestOf(provider);

        var client = new AiChatClientFactory().Create(provider, "x", model.Id, 1024);

        Assert.NotNull(client);
    }
}
