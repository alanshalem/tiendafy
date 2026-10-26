using System.Net;
using System.Text;
using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;

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

    /// <summary>Contesta 503 a todo y cuenta los pedidos: ninguno sale a la red.</summary>
    private sealed class Always503 : HttpMessageHandler
    {
        public int Requests;
        public string? Host;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref Requests);
            Host = request.RequestUri?.Host;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
            {
                Content = new StringContent("""{"error":{"message":"caído"}}""", Encoding.UTF8, "application/json"),
            });
        }
    }

    [Theory]
    [InlineData(AiProvider.Anthropic, "api.anthropic.com")]
    [InlineData(AiProvider.OpenAI, "api.openai.com")]
    [InlineData(AiProvider.Google, "generativelanguage.googleapis.com")]
    [InlineData(AiProvider.Groq, "api.groq.com")]
    public async Task El_SDK_no_reintenta_por_su_cuenta(AiProvider provider, string host)
    {
        // El único reintento es el respaldo del gateway: un 503 tiene que llegar en el primer pedido.
        var handler = new Always503();
        var model = AiModelCatalog.CheapestOf(provider);
        using var client = new AiChatClientFactory(handler).Create(provider, "sk-test-123456", model.Id, 16);

        await Assert.ThrowsAnyAsync<Exception>(() => client.GetResponseAsync([new ChatMessage(ChatRole.User, "hola")]));

        Assert.Equal(1, handler.Requests);
        // Fijar las opciones de reintento no cambia a dónde va el pedido.
        Assert.Equal(host, handler.Host);
    }
}
