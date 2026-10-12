using Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure;

/// <summary>El registro de quién cambió qué en el equipo de cada tienda.</summary>
public interface IAuditLog
{
    Task RecordAsync(Guid tenantId, Guid? actorUserId, string actorName, string action, string summary, CancellationToken ct = default);
    Task<(IReadOnlyList<AuditEvent> Items, int Total)> ListAsync(Guid tenantId, int limit, int offset, CancellationToken ct = default);
}

public sealed class AuditLog(AppIdentityDbContext db) : IAuditLog
{
    public async Task RecordAsync(
        Guid tenantId, Guid? actorUserId, string actorName, string action, string summary, CancellationToken ct = default)
    {
        db.AuditEvents.Add(new AuditEvent(tenantId, actorUserId, actorName, action, summary));
        await db.SaveChangesAsync(ct);
    }

    public async Task<(IReadOnlyList<AuditEvent> Items, int Total)> ListAsync(
        Guid tenantId, int limit, int offset, CancellationToken ct = default)
    {
        var query = db.AuditEvents.AsNoTracking().Where(e => e.TenantId == tenantId);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(e => e.CreatedAtUtc).Skip(offset).Take(limit).ToListAsync(ct);
        return (items, total);
    }
}
