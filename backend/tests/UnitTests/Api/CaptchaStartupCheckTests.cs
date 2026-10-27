using Api.Captcha;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace UnitTests.Api;

/// <summary>
/// Sin el secret de Turnstile, el captcha deja pasar todo. En Development es
/// lo esperable; en producción quiere decir que los formularios públicos
/// quedaron sin anti-bots, y antes nadie se enteraba. No se tira la app abajo
/// (cortaría las ventas): se grita en el log al arrancar.
/// </summary>
public sealed class CaptchaStartupCheckTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Api";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class ListLogger<T> : ILogger<T>
    {
        public List<LogLevel> Levels { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Levels.Add(logLevel);
    }

    private static TurnstileVerifier Verifier(string? secret) => new(new HttpClient(),
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Captcha:Turnstile:Secret"] = secret,
        }).Build());

    [Theory]
    [InlineData("Production", null, true)]
    [InlineData("Staging", "", true)]
    [InlineData("Development", null, false)]
    [InlineData("Production", "0x4AAAA-secret", false)]
    public async Task Sin_secret_fuera_de_Development_avisa_como_critico(string environment, string? secret, bool critical)
    {
        var logger = new ListLogger<CaptchaStartupCheck>();
        await new CaptchaStartupCheck(Verifier(secret), new Env(environment), logger).StartAsync(CancellationToken.None);

        Assert.Equal(critical, logger.Levels.Contains(LogLevel.Critical));
    }

    [Fact]
    public async Task Sin_secret_igual_deja_pasar_para_no_cortar_las_ventas()
    {
        Assert.True(await Verifier(null).VerifyAsync(null));
    }
}
