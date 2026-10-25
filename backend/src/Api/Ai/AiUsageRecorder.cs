using Ai.Infrastructure;

namespace Api.Ai;

/// <summary>Una llamada a un modelo lista para registrar. Los tokens ya vienen normalizados (ver <see cref="MeteringChatClient"/>).</summary>
public sealed record AiUsageEntry(
    Guid TenantId,
    Guid? UserId,
    AiTask Task,
    AiModelInfo Model,
    Guid RunId,
    long InputTokens,
    long CachedInputTokens,
    long OutputTokens,
    AiOutcome Outcome,
    long? CostMicroUsd = null);

public interface IAiUsageRecorder
{
    /// <summary>Inserta una fila de <see cref="AiUsage"/> con el costo de la entrada o, si no trae, el calculado por <see cref="AiCost"/>.</summary>
    Task RecordAsync(AiUsageEntry entry, CancellationToken ct);
}

/// <summary>
/// Singleton: lo llaman el bucle de herramientas y los workers, que no tienen un request ni un
/// DbContext propio. Abre un scope por inserción en vez de retener un contexto.
/// </summary>
public sealed class AiUsageRecorder(IServiceScopeFactory scopes, TimeProvider clock) : IAiUsageRecorder
{
    public async Task RecordAsync(AiUsageEntry entry, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        db.Usage.Add(new AiUsage
        {
            Id = Guid.NewGuid(),
            TenantId = entry.TenantId,
            UserId = entry.UserId,
            Task = entry.Task,
            Provider = entry.Model.Provider,
            Model = entry.Model.Id,
            RunId = entry.RunId,
            InputTokens = entry.InputTokens,
            CachedInputTokens = entry.CachedInputTokens,
            OutputTokens = entry.OutputTokens,
            CostMicroUsd = entry.CostMicroUsd
                ?? AiCost.MicroUsd(entry.Model, entry.InputTokens, entry.CachedInputTokens, entry.OutputTokens),
            Outcome = entry.Outcome,
            CreatedAtUtc = clock.GetUtcNow().UtcDateTime,
        });
        await db.SaveChangesAsync(ct);
    }
}
