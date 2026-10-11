using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Workers;

/// <summary>
/// Loop de drenaje de un inbox durable (<see cref="InboxEntry"/>): toma los
/// eventos vencidos más viejos, procesa cada uno, marca done/failed y guarda
/// por ítem (un ítem venenoso no frena a los demás). El log del error queda en
/// el callback para preservar el template estructurado de cada worker.
///
/// <para>
/// Cada evento se reclama con un UPDATE condicional antes de tocarlo —el mismo
/// patrón que ya usaba el worker de redes—, así que con más de una instancia
/// de la Api corriendo no hay dos workers procesando el mismo webhook. Sin el
/// claim los efectos se duplicaban: el mail de compra confirmada, el WhatsApp
/// y la factura encolada dos veces.
/// </para>
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
        var now = DateTime.UtcNow;

        var due = await set
            .Where(e => e.Status == InboxEntry.StatusPending && e.NextAttemptAtUtc <= now)
            .OrderBy(e => e.NextAttemptAtUtc)
            .Take(batchSize)
            .ToListAsync(ct);

        foreach (var entry in due)
        {
            // Claim atómico por fila: empuja el próximo intento un lease hacia
            // adelante. Si otra instancia llegó antes, el WHERE ya no da y
            // vuelven 0 filas. El mismo campo sirve de backoff y de lease: una
            // sola columna, y no hay un estado "procesando" que limpiar cuando
            // un proceso se muere a la mitad.
            var leasedUntil = DateTime.UtcNow + InboxEntry.Lease;
            var claimed = await set
                .Where(e => e.Id == entry.Id
                    && e.Status == InboxEntry.StatusPending
                    && e.NextAttemptAtUtc <= now)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.NextAttemptAtUtc, leasedUntil), ct);

            if (claimed != 1) continue;
            entry.MarkLeased(leasedUntil); // alinea la entidad trackeada con la base

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
