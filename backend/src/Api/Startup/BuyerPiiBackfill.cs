using Checkout.Infrastructure.Persistence;
using Orders.Infrastructure.Persistence;

namespace Api.Startup;

/// <summary>
/// Cifra el teléfono, el documento y la dirección del comprador que quedaron en
/// claro en ventas y checkouts de antes del cifrado. Idempotente: sin nada
/// pendiente es una consulta por tabla.
///
/// Corre solo al arrancar la versión nueva de la API (<see cref="BuyerPiiBackfillService"/>,
/// con <c>Workers:Enabled</c>), nunca en el paso de migración: en un deploy la
/// versión vieja sigue atendiendo mientras corre <c>migrate</c> y no sabe
/// descifrar; si encontrara cifrados el teléfono, el DNI o la dirección, los
/// mostraría, facturaría y mandaría por mail así. Lo que la vieja guarde en
/// claro en ese rato lo cifra esta misma pasada. Nunca dentro de un request.
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
            // corrida (el próximo arranque) lo vuelve a intentar.
            logger.LogWarning(ex, "No se pudieron cifrar los datos del comprador que estaban en claro.");
        }
    }
}
