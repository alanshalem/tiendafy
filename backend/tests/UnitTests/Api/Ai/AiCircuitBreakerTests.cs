using Ai.Infrastructure;
using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiCircuitBreakerTests
{
    private static readonly Guid Tenant = Guid.NewGuid();

    [Fact]
    public void Tres_fallas_seguidas_lo_abren_cinco_minutos()
    {
        var clock = new ManualClock();
        var breaker = new AiCircuitBreaker(clock);

        breaker.RecordFailure(Tenant, AiProvider.Anthropic);
        breaker.RecordFailure(Tenant, AiProvider.Anthropic);
        Assert.False(breaker.IsOpen(Tenant, AiProvider.Anthropic));

        breaker.RecordFailure(Tenant, AiProvider.Anthropic);
        Assert.True(breaker.IsOpen(Tenant, AiProvider.Anthropic));

        clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromSeconds(1));
        Assert.True(breaker.IsOpen(Tenant, AiProvider.Anthropic));

        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.False(breaker.IsOpen(Tenant, AiProvider.Anthropic));
    }

    [Fact]
    public void Un_exito_reinicia_la_cuenta()
    {
        var breaker = new AiCircuitBreaker(new ManualClock());

        breaker.RecordFailure(Tenant, AiProvider.OpenAI);
        breaker.RecordFailure(Tenant, AiProvider.OpenAI);
        breaker.RecordSuccess(Tenant, AiProvider.OpenAI);
        breaker.RecordFailure(Tenant, AiProvider.OpenAI);

        Assert.False(breaker.IsOpen(Tenant, AiProvider.OpenAI));
    }

    [Fact]
    public void Pasados_los_cinco_minutos_una_falla_lo_vuelve_a_abrir()
    {
        var clock = new ManualClock();
        var breaker = new AiCircuitBreaker(clock);
        for (var i = 0; i < 3; i++) breaker.RecordFailure(Tenant, AiProvider.Google);

        clock.Advance(TimeSpan.FromMinutes(5));
        breaker.RecordFailure(Tenant, AiProvider.Google);

        Assert.True(breaker.IsOpen(Tenant, AiProvider.Google));
    }

    [Fact]
    public void Es_por_tienda_y_proveedor()
    {
        var breaker = new AiCircuitBreaker(new ManualClock());
        var other = Guid.NewGuid();
        for (var i = 0; i < 3; i++) breaker.RecordFailure(Tenant, AiProvider.Groq);

        Assert.True(breaker.IsOpen(Tenant, AiProvider.Groq));
        Assert.False(breaker.IsOpen(other, AiProvider.Groq));
        Assert.False(breaker.IsOpen(Tenant, AiProvider.Anthropic));
    }
}
