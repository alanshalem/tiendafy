using System.Collections.Concurrent;
using Ai.Infrastructure;

namespace Api.Ai;

/// <summary>
/// Corte por fallas, en memoria (la API corre en una sola instancia): 3 fallas seguidas de un
/// proveedor en una tienda lo dan por caído 5 minutos y mientras tanto el gateway va directo al
/// respaldo. Pasado ese rato se lo vuelve a probar: un éxito lo cierra y una falla más lo vuelve
/// a abrir otros 5 minutos. Singleton.
/// </summary>
public sealed class AiCircuitBreaker(TimeProvider clock)
{
    public const int FailuresToOpen = 3;
    public static readonly TimeSpan OpenFor = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<(Guid TenantId, AiProvider Provider), State> _states = new();

    public bool IsOpen(Guid tenantId, AiProvider provider)
    {
        if (!_states.TryGetValue((tenantId, provider), out var state)) return false;
        lock (state) return state.OpenUntil is { } until && clock.GetUtcNow() < until;
    }

    public void RecordSuccess(Guid tenantId, AiProvider provider) =>
        _states.TryRemove((tenantId, provider), out _);

    public void RecordFailure(Guid tenantId, AiProvider provider)
    {
        var state = _states.GetOrAdd((tenantId, provider), _ => new State());
        lock (state)
        {
            state.ConsecutiveFailures++;
            if (state.ConsecutiveFailures >= FailuresToOpen)
                state.OpenUntil = clock.GetUtcNow() + OpenFor;
        }
    }

    private sealed class State
    {
        public int ConsecutiveFailures;
        public DateTimeOffset? OpenUntil;
    }
}
