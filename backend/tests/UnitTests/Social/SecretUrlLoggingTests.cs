using System.Collections.Concurrent;
using System.Net;
using Api.Startup;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;

namespace UnitTests.Social;

/// <summary>
/// Los clientes HTTP que llevan un secreto en la URL no la dejan en los logs.
/// El token del bot de Telegram va en el path, y el log por defecto de
/// IHttpClientFactory escribe la URL entera en Information. Se arma la
/// registración real (<see cref="ServiceRegistration.AddIntegrations"/>) con
/// un logger que guarda todo, desde Trace.
/// </summary>
public sealed class SecretUrlLoggingTests
{
    private const string Secret = "123456:AAH-secreto-del-bot";
    private const string QuerySecret = "EAAG-secreto-de-meta";

    private sealed class Capture : ILoggerProvider
    {
        public ConcurrentQueue<string> Lines { get; } = new();

        public ILogger CreateLogger(string categoryName) => new Logger(categoryName, Lines);

        public void Dispose() { }

        private sealed class Logger(string category, ConcurrentQueue<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter) =>
                lines.Enqueue($"{category} | {formatter(state, exception)} | {state} | {exception}");
        }
    }

    private sealed class Ok : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") });
    }

    private static (IHttpClientFactory Factory, Capture Logs) Build()
    {
        var capture = new Capture();
        var services = new ServiceCollection();
        services.AddLogging(b => b.SetMinimumLevel(LogLevel.Trace).AddProvider(capture));
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Workers:Enabled"] = "false" })
            .Build();
        services.AddIntegrations(config);
        // Nada sale a internet: todos los clientes terminan en un handler que dice que sí.
        services.ConfigureAll<HttpClientFactoryOptions>(o =>
            o.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = new Ok()));
        return (services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>(), capture);
    }

    [Theory]
    [InlineData("TelegramChannel", $"https://api.telegram.org/bot{Secret}/sendMessage")]
    [InlineData("MetaFacebookChannel", $"https://graph.facebook.com/v26.0/bot{Secret}/feed?access_token={QuerySecret}")]
    [InlineData("MetaInstagramChannel", $"https://graph.facebook.com/v26.0/bot{Secret}/media?access_token={QuerySecret}")]
    [InlineData("MetaSocialConnector", $"https://graph.facebook.com/v26.0/bot{Secret}/accounts?access_token={QuerySecret}")]
    [InlineData("MetaAdsClient", $"https://graph.facebook.com/v26.0/bot{Secret}/insights?access_token={QuerySecret}")]
    public async Task Los_clientes_con_secretos_en_la_url_no_la_loguean(string client, string url)
    {
        var (factory, logs) = Build();

        using var response = await factory.CreateClient(client).PostAsync(url, new StringContent("{}"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Se sigue logueando el pedido (host y status), pero no la URL.
        Assert.Contains(logs.Lines, l => l.Contains(new Uri(url).Host) && l.Contains("200"));
        Assert.DoesNotContain(logs.Lines, l => l.Contains(Secret) || l.Contains(QuerySecret));
    }

    [Fact]
    public async Task Sin_eso_el_log_por_defecto_escribe_el_path()
    {
        // El control: un cliente común (WhatsApp no lleva secretos en la URL)
        // con el log por defecto. Si esto deja de pasar, el test de arriba no
        // prueba nada.
        var (factory, logs) = Build();

        using var _ = await factory.CreateClient("WhatsAppSender")
            .PostAsync($"https://graph.facebook.com/v26.0/bot{Secret}/messages?access_token={QuerySecret}", new StringContent("{}"));

        Assert.Contains(logs.Lines, l => l.Contains(Secret));
        // La query la redacta .NET solo (desde .NET 9); el path no.
        Assert.DoesNotContain(logs.Lines, l => l.Contains(QuerySecret));
    }
}
