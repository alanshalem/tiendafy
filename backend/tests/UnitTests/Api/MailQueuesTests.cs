using Api.Auth;
using Api.Middleware;
using Api.Shop;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace UnitTests.Api;

/// <summary>
/// Las colas en memoria de los emails de cuenta (panel y comprador) tienen
/// tope: un "olvidé mi contraseña" en masa, con Resend lento o caído, no puede
/// acumular trabajo hasta tumbar la API. Lo que no entra se descarta con un
/// aviso en el log.
/// </summary>
public sealed class MailQueuesTests
{
    [Fact]
    public void La_cola_del_panel_descarta_lo_que_no_entra_y_lo_avisa()
    {
        var log = new ListLogger<PanelAccountEmails>();
        var emails = new PanelAccountEmails(log, capacity: 2);

        emails.Enqueue("a@test.local", "Uno", "<p>1</p>");
        emails.Enqueue("b@test.local", "Dos", "<p>2</p>");
        emails.Enqueue("c@test.local", "Tres", "<p>3</p>");

        Assert.Equal(2, emails.Reader.Count);
        var warning = Assert.Single(log.Entries, e => e.Level == LogLevel.Warning);
        Assert.Contains("llena", warning.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("c@test.local", warning.Message, StringComparison.Ordinal); // sin el email de nadie

        // Lo que entró sale en orden, y al vaciarse vuelve a haber lugar.
        Assert.True(emails.Reader.TryRead(out var first));
        Assert.Equal("Uno", first.Subject);
        emails.Enqueue("d@test.local", "Cuatro", "<p>4</p>");
        Assert.Equal(2, emails.Reader.Count);
    }

    [Fact]
    public async Task El_despacho_del_comprador_no_corre_mas_trabajos_que_el_tope()
    {
        var log = new ListLogger<ShopperMailDispatch>();
        var services = new ServiceCollection().AddScoped<TenantContextHolder>().BuildServiceProvider();
        var dispatch = new ShopperMailDispatch(
            services.GetRequiredService<IServiceScopeFactory>(), new Lifetime(), log, capacity: 2);

        var gate = new TaskCompletionSource();
        var started = 0;
        Func<IServiceProvider, CancellationToken, Task> slow = async (_, _) =>
        {
            Interlocked.Increment(ref started);
            await gate.Task;
        };

        var tenant = Guid.NewGuid();
        dispatch.Run(tenant, slow);
        dispatch.Run(tenant, slow);
        dispatch.Run(tenant, slow); // el tercero no entra

        var warning = Assert.Single(log.Entries, e => e.Level == LogLevel.Warning);
        Assert.Contains("se descarta", warning.Message, StringComparison.Ordinal);

        Assert.Equal(2, dispatch.Pending);
        gate.SetResult();
        Assert.True(SpinWait.SpinUntil(() => dispatch.Pending == 0, TimeSpan.FromSeconds(10)));
        Assert.Equal(2, started);

        // Terminados, vuelve a haber lugar.
        var ran = new TaskCompletionSource();
        dispatch.Run(tenant, (_, _) =>
        {
            ran.SetResult();
            return Task.CompletedTask;
        });
        await ran.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Single(log.Entries, e => e.Level == LogLevel.Warning);
    }

    private sealed class Lifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => CancellationToken.None;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() { }
    }

    private sealed class ListLogger<T> : ILogger<T>
    {
        public System.Collections.Concurrent.ConcurrentQueue<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Enqueue((logLevel, formatter(state, exception)));
    }
}
