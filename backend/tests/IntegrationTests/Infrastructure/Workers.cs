using System.Reflection;
using Api.Workers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Una pasada de un worker de polling, a pedido del test.
///
/// <para>
/// En los tests los workers están apagados (<c>Workers:Enabled=false</c>):
/// correrían en paralelo con los tests y sus efectos aparecerían cuando
/// quisieran. En cambio, el test arma la situación y le pide al worker UNA
/// pasada, en el momento justo, con su propio scope.
/// </para>
///
/// <para>
/// La pasada se invoca por reflexión porque <c>PollOnceAsync</c> es
/// protegido, y así queda: abrirlo solo para los tests ensancharía la API de
/// producción. Una excepción adentro de la pasada llega al test (en
/// producción la loguea el bucle del worker y sigue).
/// </para>
/// </summary>
public static class Workers
{
    private static readonly MethodInfo PollOnce = typeof(PollingWorker)
        .GetMethod("PollOnceAsync", BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("PollingWorker ya no tiene PollOnceAsync: actualizar este helper.");

    public static async Task RunOnceAsync<TWorker>(ApiFactory factory) where TWorker : PollingWorker
    {
        var worker = ActivatorUtilities.CreateInstance<TWorker>(factory.Services);
        try
        {
            await (Task)PollOnce.Invoke(worker, [CancellationToken.None])!;
        }
        finally
        {
            worker.Dispose();
        }
    }
}
