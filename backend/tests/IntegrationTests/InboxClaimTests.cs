using Api.Workers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Dos workers, un webhook: contra Postgres real.
///
/// El inbox se drena con polling, así que con más de una instancia de la Api
/// las dos levantan el mismo evento pendiente al mismo tiempo. La orden se
/// salvaba igual (tiene token de concurrencia y el handler chequea que siga
/// pendiente), pero los efectos no: el mail de compra confirmada, el WhatsApp
/// al comprador y la factura encolada salían dos veces.
///
/// Acá se corren los dos drenajes en paralelo y se exige que el evento se
/// procese UNA sola vez. Sin el claim atómico, este test falla.
/// </summary>
[Collection("api")]
public sealed class InboxClaimTests
{
    private readonly ApiFactory _factory;

    public InboxClaimTests(ApiFactory factory) => _factory = factory;

    /// <summary>Un drenaje con su propio contexto, como sería otra instancia de la Api.</summary>
    private async Task DrainAsync(Guid eventId, Func<Task> onProcess)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();

        await InboxDrain.DrainAsync(
            db,
            db.PaymentWebhookEvents.IgnoreQueryFilters().Where(e => e.Id == eventId),
            _ => onProcess(),
            (_, _) => { },
            CancellationToken.None);
    }

    [Fact]
    public async Task Dos_instancias_no_procesan_el_mismo_webhook()
    {
        var dataId = $"it-{Guid.NewGuid():N}";
        Guid eventId;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var ev = PaymentWebhookEvent.Receive("payment", dataId, userId: 0);
            db.PaymentWebhookEvents.Add(ev);
            await db.SaveChangesAsync();
            eventId = ev.Id;
        }

        // Compuerta: el primer worker queda ADENTRO del procesamiento mientras
        // el segundo hace su pasada. Dejarlo al azar de dos tareas en paralelo
        // no sirve —se turnan y el test pasa igual sin claim—; acá la ventana
        // donde los dos tienen el evento a la vez está garantizada.
        var adentro = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var soltar = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var veces = 0;

        var primero = DrainAsync(eventId, async () =>
        {
            Interlocked.Increment(ref veces);
            adentro.TrySetResult();
            await soltar.Task;
        });

        await adentro.Task.WaitAsync(TimeSpan.FromSeconds(30));

        // Segundo worker, con el primero todavía procesando.
        await DrainAsync(eventId, () =>
        {
            Interlocked.Increment(ref veces);
            return Task.CompletedTask;
        });

        soltar.SetResult();
        await primero.WaitAsync(TimeSpan.FromSeconds(30));

        Assert.Equal(1, Volatile.Read(ref veces));

        using var check = _factory.Services.CreateScope();
        var final = await check.ServiceProvider.GetRequiredService<PaymentsDbContext>()
            .PaymentWebhookEvents.IgnoreQueryFilters().AsNoTracking().FirstAsync(e => e.Id == eventId);
        Assert.Equal(InboxEntry.StatusDone, final.Status);
    }

    [Fact]
    public async Task Un_webhook_pospuesto_no_se_toma_antes_de_tiempo()
    {
        // Lo que hace que el backoff sirva: mientras espera, el worker lo saltea.
        var dataId = $"it-{Guid.NewGuid():N}";
        Guid eventId;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var ev = PaymentWebhookEvent.Receive("payment", dataId, userId: 0);
            ev.MarkFailed("MP devolvió 503"); // lo empuja al futuro
            db.PaymentWebhookEvents.Add(ev);
            await db.SaveChangesAsync();
            eventId = ev.Id;
        }

        var veces = 0;
        await DrainAsync(eventId, () => { Interlocked.Increment(ref veces); return Task.CompletedTask; });

        Assert.Equal(0, Volatile.Read(ref veces));

        using var check = _factory.Services.CreateScope();
        var final = await check.ServiceProvider.GetRequiredService<PaymentsDbContext>()
            .PaymentWebhookEvents.IgnoreQueryFilters().AsNoTracking().FirstAsync(e => e.Id == eventId);
        Assert.Equal(InboxEntry.StatusPending, final.Status);
        Assert.Equal(1, final.Attempts);
    }
}
