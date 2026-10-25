using System.Security.Cryptography;
using Ai.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Ai;

/// <summary>Principal y respaldo asignados a una tarea (ids del catálogo, sin validar).</summary>
public sealed record AiTaskModels(string Primary, string? Fallback);

/// <summary>Lo que el gateway necesita de la configuración de IA de una tienda. Sin claves.</summary>
public sealed record AiTenantConfigSnapshot(
    bool Enabled,
    long MonthlyBudgetMicroUsd,
    IReadOnlyDictionary<AiTask, AiTaskModels> Assignments,
    IReadOnlySet<AiProvider> ProvidersWithKey);

/// <summary>Lectura de la configuración de IA de una tienda para el gateway.</summary>
public interface IAiTenantConfig
{
    Task<AiTenantConfigSnapshot> LoadAsync(Guid tenantId, CancellationToken ct);

    /// <summary>La clave descifrada, o null si no hay o no se puede descifrar. Nunca va a un log.</summary>
    Task<string?> KeyAsync(Guid tenantId, AiProvider provider, CancellationToken ct);
}

/// <summary>
/// Scoped (usa el <see cref="AiDbContext"/> del scope). Filtra la tienda a mano e ignora el filtro
/// de EF: los workers corren sin request y pasan la tienda en <see cref="AiRunOptions.TenantId"/>.
/// </summary>
public sealed class AiTenantConfig(AiDbContext db, IAiKeyProtector keys, ILogger<AiTenantConfig> logger) : IAiTenantConfig
{
    public async Task<AiTenantConfigSnapshot> LoadAsync(Guid tenantId, CancellationToken ct)
    {
        var settings = await db.Settings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        var assignments = await db.Assignments.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.TenantId == tenantId)
            .ToDictionaryAsync(a => a.Task, a => new AiTaskModels(a.PrimaryModel, a.FallbackModel), ct);
        var providers = await db.Credentials.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .Select(c => c.Provider)
            .ToListAsync(ct);
        return new AiTenantConfigSnapshot(
            settings?.Enabled ?? false,
            settings?.MonthlyBudgetMicroUsd ?? 0,
            assignments,
            providers.ToHashSet());
    }

    public async Task<string?> KeyAsync(Guid tenantId, AiProvider provider, CancellationToken ct)
    {
        var encrypted = await db.Credentials.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantId == tenantId && c.Provider == provider)
            .Select(c => c.KeyEncrypted)
            .FirstOrDefaultAsync(ct);
        if (encrypted is null) return null;
        try
        {
            return keys.Unprotect(encrypted);
        }
        catch (CryptographicException)
        {
            // Claves de DataProtection perdidas o rotadas: hay que volver a cargarla.
            logger.LogWarning("No se pudo descifrar la clave de {Provider} de la tienda {TenantId}.", provider, tenantId);
            return null;
        }
    }
}
