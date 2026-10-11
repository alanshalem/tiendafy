using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace UnitTests.Payments;

/// <summary>
/// La política de reintentos del inbox durable.
///
/// El caso que importa: a un webhook de pago ya se le contestó 200, así que el
/// proveedor no lo va a reenviar. Si el inbox se queda sin intentos, la venta
/// cobrada no se registra y nadie se entera. Antes los seis intentos se
/// gastaban en treinta segundos porque el worker reintentaba en cada vuelta;
/// lo que se prueba acá es que una caída corta del proveedor ya no alcance.
/// </summary>
public sealed class InboxRetryTests
{
    private static PaymentWebhookEvent Nuevo() => PaymentWebhookEvent.Receive("payment", "123", 42);

    [Fact]
    public void Un_evento_nuevo_se_puede_tomar_ya()
    {
        var ev = Nuevo();

        Assert.Equal(InboxEntry.StatusPending, ev.Status);
        Assert.Equal(0, ev.Attempts);
        Assert.Equal(ev.CreatedAtUtc, ev.NextAttemptAtUtc);
        Assert.True(ev.NextAttemptAtUtc <= DateTime.UtcNow);
    }

    [Fact]
    public void Un_fallo_no_mata_el_evento_lo_pospone()
    {
        var ev = Nuevo();
        ev.MarkFailed("MP devolvió 503");

        Assert.Equal(InboxEntry.StatusPending, ev.Status);
        Assert.Equal(1, ev.Attempts);
        Assert.Equal("MP devolvió 503", ev.LastError);
        Assert.True(ev.NextAttemptAtUtc > DateTime.UtcNow, "el reintento tiene que quedar en el futuro");
    }

    [Fact]
    public void Cada_fallo_espera_mas_que_el_anterior()
    {
        var ev = Nuevo();
        var esperas = new List<TimeSpan>();

        for (var i = 0; i < InboxEntry.MaxAttempts - 1; i++)
        {
            ev.MarkFailed("boom");
            esperas.Add(ev.NextAttemptAtUtc - DateTime.UtcNow);
        }

        Assert.Equal(InboxEntry.MaxAttempts - 1, esperas.Count);
        for (var i = 1; i < esperas.Count; i++)
            Assert.True(esperas[i] > esperas[i - 1], $"la espera {i + 1} no es mayor que la {i}");
    }

    [Fact]
    public void El_inbox_aguanta_horas_de_proveedor_caido_no_segundos()
    {
        // El número exacto puede cambiar; lo que no puede volver a pasar es que
        // los intentos se agoten en el tiempo de un deploy del proveedor.
        var ev = Nuevo();
        var total = TimeSpan.Zero;

        for (var i = 0; i < InboxEntry.MaxAttempts - 1; i++)
        {
            var antes = DateTime.UtcNow;
            ev.MarkFailed("boom");
            total += ev.NextAttemptAtUtc - antes;
        }

        Assert.True(total > TimeSpan.FromHours(12),
            $"el inbox se rinde después de {total}; eso es menos de lo que dura una caída real.");
    }

    [Fact]
    public void Agotados_los_intentos_queda_muerto()
    {
        var ev = Nuevo();
        for (var i = 0; i < InboxEntry.MaxAttempts; i++) ev.MarkFailed("boom");

        Assert.Equal(InboxEntry.StatusDead, ev.Status);
        Assert.Equal(InboxEntry.MaxAttempts, ev.Attempts);
        Assert.NotNull(ev.ProcessedAtUtc);
    }

    [Fact]
    public void Un_evento_muerto_se_puede_devolver_a_la_cola()
    {
        var ev = Nuevo();
        for (var i = 0; i < InboxEntry.MaxAttempts; i++) ev.MarkFailed("boom");

        Assert.True(ev.Revive());
        Assert.Equal(InboxEntry.StatusPending, ev.Status);
        Assert.Equal(0, ev.Attempts);
        Assert.Null(ev.ProcessedAtUtc);
        Assert.True(ev.NextAttemptAtUtc <= DateTime.UtcNow, "revivido, se tiene que poder tomar ya");
    }

    [Fact]
    public void Revivir_algo_que_no_esta_muerto_no_hace_nada()
    {
        // Si reviviera un evento en vuelo, lo estaría reprocesando a la fuerza.
        var enVuelo = Nuevo();
        enVuelo.MarkFailed("boom");
        Assert.False(enVuelo.Revive());
        Assert.Equal(1, enVuelo.Attempts);

        var listo = Nuevo();
        listo.MarkDone();
        Assert.False(listo.Revive());
        Assert.Equal(InboxEntry.StatusDone, listo.Status);
    }

    [Fact]
    public void Terminar_bien_limpia_el_ultimo_error()
    {
        var ev = Nuevo();
        ev.MarkFailed("se cayó MP");
        ev.MarkDone();

        Assert.Equal(InboxEntry.StatusDone, ev.Status);
        Assert.Null(ev.LastError);
        Assert.NotNull(ev.ProcessedAtUtc);
    }
}
