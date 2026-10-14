using Api.Middleware;
using Api.Workers;
using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// Pasa cada 5 minutos por las tiendas con alertas de stock prendidas.
///
/// <para>
/// Cada tienda se reclama con un UPDATE condicional sobre su
/// <see cref="StockAlertSettings.NextRunAtUtc"/> (el mismo patrón de claim por
/// fila que el resto de los workers): con dos instancias de la Api, una sola
/// la evalúa. La pasada corre en su propio scope con la tienda fijada, como un
/// request, para que los filtros por tienda de cada módulo apliquen igual.
/// </para>
/// </summary>
public sealed class StockAlertWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<StockAlertWorker> logger) : PollingWorker(TimeSpan.FromMinutes(5))
{
    /// <summary>Lo que dura el turno de una tienda (algo menos que el intervalo del worker).</summary>
    private static readonly TimeSpan Lease = TimeSpan.FromMinutes(4);

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Alertas de stock bajo fallaron.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        List<(Guid Id, Guid TenantId)> due;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
            var now = DateTime.UtcNow;
            due = (await db.StockAlertSettings.IgnoreQueryFilters().AsNoTracking()
                    .Where(s => s.Mode != StockAlertMode.Off && s.NextRunAtUtc <= now)
                    .OrderBy(s => s.NextRunAtUtc)
                    .Take(100)
                    .Select(s => new { s.Id, s.TenantId })
                    .ToListAsync(ct))
                .Select(s => (s.Id, s.TenantId))
                .ToList();
        }

        foreach (var (id, tenantId) in due)
        {
            try { await RunTenantAsync(id, tenantId, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Alertas de stock bajo fallaron para el tenant {TenantId}.", tenantId);
            }
        }
    }

    private async Task RunTenantAsync(Guid settingsId, Guid tenantId, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(tenantId));
        var db = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();

        var now = DateTime.UtcNow;
        var claimed = await db.StockAlertSettings
            .Where(s => s.Id == settingsId && s.NextRunAtUtc <= now)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.NextRunAtUtc, now + Lease), ct);
        if (claimed != 1) return;

        var run = await scope.ServiceProvider.GetRequiredService<StockAlertService>()
            .EvaluateAsync(TenantId.From(tenantId), now, ct);
        if (run.Notified > 0)
            logger.LogInformation("Stock bajo: {Notified} variantes avisadas a {Recipients} personas (tenant {TenantId}).",
                run.Notified, run.Recipients, tenantId);
    }
}
