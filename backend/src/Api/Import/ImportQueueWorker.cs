namespace Api.Import;

/// <summary>
/// Base de los workers que consumen una cola de importación: toma los jobs de
/// a uno, delega el trabajo real en la subclase y, si algo explota, deja el job
/// en Failed con un mensaje que el usuario puede leer.
///
/// El detalle técnico va al log del servidor y NUNCA al cliente: uno de los dos
/// workers devolvía `ex.Message` crudo en la pantalla de importación, que es
/// justo donde un error de base de datos o de storage cuenta más de la cuenta.
/// </summary>
public abstract class ImportQueueWorker<TJob>(JobQueue<TJob> queue, ILogger logger) : BackgroundService
    where TJob : class, IImportJob
{
    /// <summary>El trabajo en sí. Las excepciones las maneja la base.</summary>
    protected abstract Task ProcessJobAsync(TJob job, CancellationToken ct);

    /// <summary>Corre siempre al terminar el job, haya fallado o no (limpieza de temporales).</summary>
    protected virtual void OnFinished(TJob job) { }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var jobId in queue.Reader.ReadAllAsync(stoppingToken))
        {
            var job = queue.Get(jobId);
            if (job is null) continue;

            try
            {
                await ProcessJobAsync(job, stoppingToken);
            }
            catch (Exception ex)
            {
                job.Status = ImportStatus.Failed;
                job.FailureMessage = "La importación falló por un error inesperado.";
                job.FinishedAtUtc = DateTime.UtcNow;
                logger.LogError(ex, "Importación {JobId} falló.", job.Id);
            }
            finally
            {
                OnFinished(job);
            }
        }
    }
}
