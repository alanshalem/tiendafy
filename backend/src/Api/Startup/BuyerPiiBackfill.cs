using Checkout.Infrastructure.Persistence;
using Orders.Infrastructure.Persistence;

namespace Api.Startup;

/// <summary>
/// Cifra el teléfono, el documento y la dirección del comprador que quedaron en
/// claro en ventas y checkouts de antes del cifrado. Idempotente: sin nada
/// pendiente es una consulta por tabla.
///
/// Corre en el paso de migración (<c>dotnet Api.dll migrate</c> y la migración
/// al arrancar) y una vez más al arrancar la API (<see cref="BuyerPiiBackfillService"/>):
/// en un deploy, la versión vieja sigue atendiendo mientras corre `migrate` y
/// lo que guarde en ese rato entra en claro. Nunca dentro de un request.
/// </summary>
public static class BuyerPiiBackfill
{
    public static async Task RunAsync(IServiceProvider services, ILogger logger, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var orders = await sp.GetRequiredService<OrdersDbContext>().ProtectLegacyPiiAsync(ct);
        var sessions = await sp.GetRequiredService<CheckoutDbContext>().ProtectLegacyPiiAsync(ct);
        if (orders + sessions > 0)
            logger.LogInformation(
                "Datos del comprador cifrados: {Orders} ventas y {Sessions} checkouts que estaban en claro.",
                orders, sessions);
    }
}

/// <summary>La pasada de <see cref="BuyerPiiBackfill"/> al arrancar, en segundo plano.</summary>
public sealed class BuyerPiiBackfillService(IServiceProvider services, ILogger<BuyerPiiBackfillService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await BuyerPiiBackfill.RunAsync(services, logger, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            // No frena nada: lo viejo se sigue leyendo en claro y la próxima
            // corrida (otro arranque, otro migrate) lo vuelve a intentar.
            logger.LogWarning(ex, "No se pudieron cifrar los datos del comprador que estaban en claro.");
        }
    }
}
