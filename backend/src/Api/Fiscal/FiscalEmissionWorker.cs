using Api.Workers;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Fiscal;

/// <summary>
/// Procesa el outbox de emisión fiscal: toma jobs pendientes listos para intentar,
/// pide el CAE a ARCA (vía IInvoiceEmitter) y marca el resultado. Reintenta los
/// fallos transitorios (red/TA) con backoff exponencial; manda a dead-letter los
/// rechazos de ARCA (datos) y los que agotan reintentos. Corre sin tenant en scope
/// (el filtro global queda bypasseado; se filtra por tenant explícito). Sobrevive
/// reinicios: el estado vive en Postgres.
/// </summary>
public sealed class FiscalEmissionWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<FiscalEmissionWorker> logger) : PollingWorker(TimeSpan.FromSeconds(10))
{
    private const int MaxAttempts = 8;
    private const int BatchSize = 20;

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Polling de emisión fiscal falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<FiscalDbContext>();
        var emitter = sp.GetRequiredService<IInvoiceEmitter>();

        var now = DateTime.UtcNow;
        var due = await db.EmissionJobs
            .Where(j => j.Status == FiscalJobStatus.Pending && j.NextAttemptUtc <= now)
            .OrderBy(j => j.NextAttemptUtc)
            .Take(BatchSize)
            .ToListAsync(ct);

        foreach (var job in due)
        {
            job.MarkProcessing();
            await db.SaveChangesAsync(ct); // reclama el job antes de llamar a ARCA

            try
            {
                var cmd = new EmitInvoiceCommand(
                    job.TenantId, job.OrderId, job.GrossMinorUnits, job.BuyerDoc,
                    PtoVta: null, CreditNote: job.Kind == FiscalJobKind.CreditNote);

                var result = await emitter.EmitAsync(cmd, ct);

                if (result.IsFailure)
                {
                    RescheduleOrFail(job, $"{result.Error.Code}: {result.Error.Message}");
                }
                else if (result.Value.Authorized)
                {
                    job.MarkDone(result.Value.DocumentId);
                    logger.LogInformation("Emisión OK (orden {Order}, {Cbte} {Pv}-{Nro}, CAE {Cae}).",
                        job.OrderId, result.Value.CbteTipo, result.Value.PtoVta, result.Value.Number, result.Value.Cae);
                }
                else
                {
                    // Rechazo de ARCA: dato inválido, reintentar igual no ayuda.
                    var err = result.Value.Errors.Count > 0
                        ? string.Join("; ", result.Value.Errors.Select(e => $"{e.Code} {e.Message}"))
                        : "Rechazado por ARCA sin detalle.";
                    job.MarkFailed(err);
                    logger.LogWarning("Emisión RECHAZADA (orden {Order}): {Err}", job.OrderId, err);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Emisión de la orden {Order} lanzó excepción (intento {Attempt}).", job.OrderId, job.Attempts);
                RescheduleOrFail(job, ex.Message);
            }

            await db.SaveChangesAsync(ct);
        }
    }

    private static void RescheduleOrFail(FiscalEmissionJob job, string error)
    {
        if (job.Attempts >= MaxAttempts)
        {
            job.MarkFailed($"Agotó {MaxAttempts} reintentos. Último error: {error}");
            return;
        }
        // Backoff exponencial acotado: 1, 2, 4, 8 ... min, tope 60 min.
        var minutes = Math.Min(60, (int)Math.Pow(2, Math.Max(0, job.Attempts - 1)));
        job.Reschedule(error, DateTime.UtcNow.AddMinutes(minutes));
    }
}
