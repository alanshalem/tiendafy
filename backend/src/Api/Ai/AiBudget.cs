using System.Collections.Concurrent;
using Ai.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using SharedKernel.Common;

namespace Api.Ai;

/// <summary>Cuánto gastó una tienda en el mes calendario argentino en curso, en micro-dólares.</summary>
public interface IAiMonthSpend
{
    Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct);
}

/// <summary>El mes de consumo es el mes calendario en hora Argentina, no el UTC.</summary>
public static class AiMonth
{
    /// <summary>[inicio, fin) en UTC del mes calendario argentino que contiene <paramref name="anyDayAr"/>.</summary>
    public static (DateTime StartUtc, DateTime EndUtc) RangeUtc(DateOnly anyDayAr)
    {
        var first = new DateOnly(anyDayAr.Year, anyDayAr.Month, 1);
        return (ArgentinaTime.StartOfDayUtc(first), ArgentinaTime.StartOfDayUtc(first.AddMonths(1)));
    }
}

/// <summary>
/// Suma <see cref="AiUsage"/> del mes. Es singleton (lo usa <see cref="AiBudget"/>, que también lo es),
/// así que abre un scope por lectura en vez de retener un DbContext. Corre fuera de un request
/// (workers), por eso ignora el filtro de tienda y filtra a mano.
/// </summary>
public sealed class AiMonthSpend(IServiceScopeFactory scopes, TimeProvider clock) : IAiMonthSpend
{
    public async Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        var today = ArgentinaTime.DateOf(clock.GetUtcNow().UtcDateTime);
        return await SumAsync(db.Usage.IgnoreQueryFilters(), tenantId, today, ct);
    }

    /// <summary>La consulta, separada para probar el corte del mes contra una lista en memoria.</summary>
    public static async Task<long> SumAsync(IQueryable<AiUsage> usage, Guid tenantId, DateOnly today, CancellationToken ct)
    {
        var (start, end) = AiMonth.RangeUtc(today);
        var costs = usage
            .Where(u => u.TenantId == tenantId && u.CreatedAtUtc >= start && u.CreatedAtUtc < end)
            .Select(u => u.CostMicroUsd);
        return costs.Provider is IAsyncQueryProvider ? await costs.SumAsync(ct) : costs.Sum();
    }
}

/// <summary>
/// Tope mensual por tienda con reserva del peor caso: antes de una ejecución se reserva lo máximo que
/// podría costar; si gastado + reservado + peor caso pasa el tope, no se ejecuta. Singleton: el estado
/// vive en memoria. La suma del mes se cachea 30 s y se le suma lo real reportado desde la última lectura.
/// </summary>
public sealed class AiBudget(IAiMonthSpend spend, TimeProvider clock)
{
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<Guid, TenantState> _tenants = new();

    public async Task<AiReservation?> TryReserveAsync(Guid tenantId, long budgetMicroUsd, long worstCaseMicroUsd, CancellationToken ct)
    {
        var state = _tenants.GetOrAdd(tenantId, _ => new TenantState());
        await state.Gate.WaitAsync(ct);
        try
        {
            var spent = await SpentAsync(tenantId, state, ct);
            lock (state)
            {
                if (spent + state.Reserved + worstCaseMicroUsd > budgetMicroUsd) return null;
                state.Reserved += worstCaseMicroUsd;
            }
            return new AiReservation(state, worstCaseMicroUsd);
        }
        finally
        {
            state.Gate.Release();
        }
    }

    /// <summary>Gastado + reservado.</summary>
    public async Task<long> CommittedMicroUsdAsync(Guid tenantId, CancellationToken ct)
    {
        var state = _tenants.GetOrAdd(tenantId, _ => new TenantState());
        await state.Gate.WaitAsync(ct);
        try
        {
            var spent = await SpentAsync(tenantId, state, ct);
            lock (state) return spent + state.Reserved;
        }
        finally
        {
            state.Gate.Release();
        }
    }

    // Llamar con state.Gate tomado.
    private async Task<long> SpentAsync(Guid tenantId, TenantState state, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var month = AiMonth.RangeUtc(ArgentinaTime.DateOf(now)).StartUtc;
        lock (state)
        {
            if (state.ReadAtUtc is { } readAt && state.Month == month && now - readAt < CacheFor)
                return state.Spent;
        }

        var fresh = await spend.SpentThisMonthMicroUsdAsync(tenantId, ct);
        lock (state)
        {
            state.Spent = fresh;
            state.ReadAtUtc = now;
            state.Month = month;
            return fresh;
        }
    }

    internal sealed class TenantState
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public long Spent;
        public long Reserved;
        public DateTime? ReadAtUtc;
        public DateTime Month;
    }
}

/// <summary>
/// Lo reservado de una ejecución. <see cref="AddActual"/> informa lo realmente gastado (ya está en
/// <see cref="AiUsage"/>); al liberar, se devuelve lo reservado y queda solo lo real.
/// </summary>
public sealed class AiReservation : IAsyncDisposable
{
    private readonly AiBudget.TenantState _state;
    private readonly long _reserved;
    private bool _disposed;

    internal AiReservation(AiBudget.TenantState state, long reserved)
    {
        _state = state;
        _reserved = reserved;
    }

    public void AddActual(long microUsd)
    {
        lock (_state) _state.Spent += microUsd;
    }

    public ValueTask DisposeAsync()
    {
        lock (_state)
        {
            if (_disposed) return ValueTask.CompletedTask;
            _disposed = true;
            _state.Reserved -= _reserved;
        }
        return ValueTask.CompletedTask;
    }
}
