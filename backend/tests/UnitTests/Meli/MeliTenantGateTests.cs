using System.Net;
using Api.Meli;
using MercadoLibre.Infrastructure;

namespace UnitTests.Meli;

public class MeliTenantGateTests
{
    private readonly List<TimeSpan> _waits = [];

    private MeliTenantGate Gate() => new((delay, _) =>
    {
        lock (_waits) _waits.Add(delay);
        return Task.CompletedTask;
    });

    private static MeliException TooMany() => new("limitado", HttpStatusCode.TooManyRequests);

    /// <summary>Una llamada que se queda adentro hasta que el test la libera; cuenta cuántas hay a la vez.</summary>
    private sealed class Probe
    {
        private int _current;
        public int Max;

        public async Task<int> CallAsync(TaskCompletionSource release)
        {
            var now = Interlocked.Increment(ref _current);
            lock (this) Max = Math.Max(Max, now);
            await release.Task;
            Interlocked.Decrement(ref _current);
            return 1;
        }

        public async Task WaitForAsync(int calls)
        {
            for (var i = 0; i < 200 && Volatile.Read(ref _current) < calls; i++) await Task.Delay(10);
        }
    }

    [Fact]
    public async Task Una_llamada_a_la_vez_por_tienda()
    {
        var gate = Gate();
        var probe = new Probe();
        var tenant = Guid.NewGuid();
        var first = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var second = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var a = gate.RunAsync(tenant, _ => probe.CallAsync(first), CancellationToken.None);
        var b = gate.RunAsync(tenant, _ => probe.CallAsync(second), CancellationToken.None);
        await probe.WaitForAsync(1);
        await Task.Delay(100); // le da tiempo a la segunda de colarse si el semáforo no anduviera
        first.SetResult();
        second.SetResult();
        await Task.WhenAll(a, b);

        Assert.Equal(1, probe.Max);
    }

    [Fact]
    public async Task Tiendas_distintas_van_en_paralelo()
    {
        var gate = Gate();
        var probe = new Probe();
        var first = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var second = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var a = gate.RunAsync(Guid.NewGuid(), _ => probe.CallAsync(first), CancellationToken.None);
        var b = gate.RunAsync(Guid.NewGuid(), _ => probe.CallAsync(second), CancellationToken.None);
        await probe.WaitForAsync(2);
        first.SetResult();
        second.SetResult();
        await Task.WhenAll(a, b);

        Assert.Equal(2, probe.Max);
    }

    [Fact]
    public async Task Dos_veces_seguidas_de_la_misma_tienda_no_se_traban()
    {
        var gate = Gate();
        var tenant = Guid.NewGuid();

        Assert.Equal(1, await gate.RunAsync(tenant, _ => Task.FromResult(1), CancellationToken.None));
        Assert.Equal(2, await gate.RunAsync(tenant, _ => Task.FromResult(2), CancellationToken.None));
    }

    [Fact]
    public async Task Un_429_espera_y_reintenta()
    {
        var gate = Gate();
        var calls = 0;

        var result = await gate.RunAsync(Guid.NewGuid(), _ =>
        {
            if (++calls == 1) throw TooMany();
            return Task.FromResult(7);
        }, CancellationToken.None);

        Assert.Equal(7, result);
        Assert.Equal([TimeSpan.FromSeconds(1)], _waits);
    }

    [Fact]
    public async Task Un_429_persistente_termina_en_MeliBusy()
    {
        var gate = Gate();

        var ex = await Assert.ThrowsAsync<MeliBusyException>(() =>
            gate.RunAsync<int>(Guid.NewGuid(), _ => throw TooMany(), CancellationToken.None));

        Assert.Contains("Mercado Libre", ex.Message);
        Assert.Equal([1, 2, 4, 8, 16], _waits.Select(w => (int)w.TotalSeconds));
    }

    [Fact]
    public async Task Otro_error_no_se_reintenta()
    {
        var gate = Gate();

        var ex = await Assert.ThrowsAsync<MeliException>(() =>
            gate.RunAsync<int>(Guid.NewGuid(), _ => throw new MeliException("roto", HttpStatusCode.InternalServerError), CancellationToken.None));

        Assert.Equal(HttpStatusCode.InternalServerError, ex.Status);
        Assert.Empty(_waits);
    }

    [Fact]
    public async Task Mientras_espera_por_un_429_nadie_mas_de_la_tienda_se_cuela()
    {
        var gate = Gate();
        var tenant = Guid.NewGuid();
        var order = new List<string>();
        var attempts = 0;

        var limited = gate.RunAsync(tenant, _ =>
        {
            lock (order) order.Add("limitada");
            if (++attempts == 1) throw TooMany();
            return Task.FromResult(1);
        }, CancellationToken.None);
        var other = gate.RunAsync(tenant, _ =>
        {
            lock (order) order.Add("otra");
            return Task.FromResult(2);
        }, CancellationToken.None);
        await Task.WhenAll(limited, other);

        // Si la otra llamada es la segunda en entrar, la primera termina (con su reintento) antes.
        var firstOther = order.IndexOf("otra");
        Assert.Equal(["limitada", "limitada"], order.Take(firstOther));
    }
}
