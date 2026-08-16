using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Workers;

/// <summary>
/// Loop de drenaje de un inbox durable (<see cref="InboxEntry"/>): toma los
/// pendientes más viejos, procesa cada uno, marca done/failed y guarda por
/// ítem (un ítem venenoso no frena a los demás). El log del error queda en el
/// callback para preservar el template estructurado de cada worker.
/// </summary>
public static class InboxDrain
{
    public static async Task DrainAsync<TEntry>(
        DbContext db,
        IQueryable<TEntry> set,
        Func<TEntry, Task> process,
        Action<Exception, TEntry> onError,
        CancellationToken ct,
        int batchSize = 20)
        where TEntry : InboxEntry
    {
        var pending = await set
            .Where(e => e.Status == InboxEntry.StatusPending)
            .OrderBy(e => e.CreatedAtUtc)
            .Take(batchSize)
            .ToListAsync(ct);

        foreach (var entry in pending)
        {
            try
            {
                await process(entry);
                entry.MarkDone();
            }
            catch (Exception ex)
            {
                onError(ex, entry);
                entry.MarkFailed(ex.Message);
            }
            await db.SaveChangesAsync(ct);
        }
    }
}
