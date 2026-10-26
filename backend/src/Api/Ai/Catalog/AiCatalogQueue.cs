using Ai.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Ai.Catalog;

/// <summary>
/// Lo que comparten la API y el worker para tocar el estado de un trabajo sin pisarse: un candado por tienda para el chequeo
/// de "un solo trabajo activo" y transiciones que se aplican solo si el trabajo sigue en el estado que se esperaba (un
/// <c>UPDATE ... WHERE Status = ...</c>, sin migración): si la API canceló el trabajo mientras el worker lo procesaba, el
/// estado nuevo manda.
/// </summary>
public static class AiCatalogQueue
{
    private const ulong Salt = 0x41_49_43_41_54_4C_47_31; // "AICATLG1": que no choque con otros candados por tienda.

    /// <summary>
    /// Toma el candado de la tienda hasta que termine la transacción actual (<c>pg_advisory_xact_lock</c>). Hay que estar dentro
    /// de una: serializa crear un trabajo y reabrir uno terminado, que son lo único que puede dejar dos activos a la vez.
    /// </summary>
    public static Task LockTenantAsync(AiDbContext ai, Guid tenantId, CancellationToken ct)
    {
        var bytes = tenantId.ToByteArray();
        var key = unchecked((long)(BitConverter.ToUInt64(bytes, 0) ^ BitConverter.ToUInt64(bytes, 8) ^ Salt));
        return ai.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock({0})", [key], ct);
    }

    /// <summary>Pasa el trabajo a <paramref name="to"/> solo si está en alguno de <paramref name="from"/>. Dice si lo cambió.</summary>
    public static async Task<bool> MoveAsync(
        AiDbContext ai, Guid tenantId, Guid jobId, DateTime nowUtc, AiCatalogJobStatus to, AiCatalogJobStatus[] from, CancellationToken ct) =>
        await ai.CatalogJobs.IgnoreQueryFilters()
            .Where(j => j.TenantId == tenantId && j.Id == jobId && from.Contains(j.Status))
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, to)
                .SetProperty(j => j.UpdatedAtUtc, nowUtc), ct) == 1;

    /// <summary>
    /// Un ítem volvió a la cola: se descuenta de los procesados y, si el trabajo había terminado, se reabre. Es un
    /// <c>UPDATE</c> condicional y no la entidad leída antes: el worker pudo cerrar el trabajo en el medio.
    /// </summary>
    public static async Task ReopenForItemAsync(AiDbContext ai, Guid tenantId, Guid jobId, DateTime nowUtc, CancellationToken ct)
    {
        await ai.CatalogJobs.IgnoreQueryFilters()
            .Where(j => j.TenantId == tenantId && j.Id == jobId && j.Processed > 0)
            .ExecuteUpdateAsync(s => s.SetProperty(j => j.Processed, j => j.Processed - 1), ct);
        await MoveAsync(ai, tenantId, jobId, nowUtc, AiCatalogJobStatus.Running, [AiCatalogJobStatus.Done], ct);
    }
}
