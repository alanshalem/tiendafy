namespace Api.Workers;

/// <summary>
/// Esqueleto común de los workers de polling (antes copiado 6 veces): loop
/// mientras no se cancele, un intento por ciclo, el error se loguea y NUNCA
/// mata al worker, y el delay respeta la cancelación. Cada worker aporta solo
/// su trabajo (PollOnceAsync) y su mensaje de error (template estático propio,
/// para no perder la forma de los logs estructurados).
/// </summary>
public abstract class PollingWorker(TimeSpan pollInterval) : BackgroundService
{
    protected abstract Task PollOnceAsync(CancellationToken ct);

    /// <summary>Loguea el fallo del ciclo con el template estático del worker.</summary>
    protected abstract void LogPollFailure(Exception ex);

    protected sealed override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PollOnceAsync(stoppingToken); }
            catch (Exception ex) { LogPollFailure(ex); }
            try { await Task.Delay(pollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
