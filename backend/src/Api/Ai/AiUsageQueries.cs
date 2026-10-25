using Ai.Infrastructure;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;
using Tenancy.Infrastructure.Persistence;

namespace Api.Ai;

public sealed record AiUsageDay(DateOnly Day, long MicroUsd);

public sealed record AiUsageSlice(string Key, long MicroUsd);

public sealed record AiUsageUser(Guid? UserId, string Name, long MicroUsd);

public sealed record AiUsageStore(Guid TenantId, string Name, long SpentMicroUsd, long BudgetMicroUsd);

/// <summary>Consumo de un mes. Todo en micro-dólares (<c>long</c>): el panel es quien lo formatea.</summary>
public sealed record AiUsageReport(
    string Month,
    string Scope,
    long BudgetMicroUsd,
    long SpentMicroUsd,
    IReadOnlyList<AiUsageDay> ByDay,
    IReadOnlyList<AiUsageSlice> ByTask,
    IReadOnlyList<AiUsageSlice> ByModel,
    IReadOnlyList<AiUsageUser> ByUser,
    IReadOnlyList<AiUsageStore>? Stores);

/// <summary>
/// Lee el consumo de IA del mes (calendario argentino). Scoped. <c>scope=owned</c> es la única lectura
/// que cruza tiendas: ignora el filtro de tienda y filtra a mano por las tiendas donde la persona es
/// dueña, nunca por las que solo administra.
/// </summary>
public sealed class AiUsageQueries(
    AiDbContext db,
    TenancyDbContext tenancy,
    UserManager<AppUser> users,
    IMembershipService memberships)
{
    private const string AutomaticName = "Automático";
    private const string UnknownName = "Alguien del equipo";

    public async Task<AiUsageReport> StoreAsync(Guid tenantId, DateOnly anyDay, CancellationToken ct)
    {
        var budget = await db.Settings.AsNoTracking().Where(s => s.TenantId == tenantId)
            .Select(s => s.MonthlyBudgetMicroUsd).FirstOrDefaultAsync(ct);
        // Con el filtro de tienda del contexto puesto: acá no se cruza nada.
        return await BuildAsync("store", anyDay, db.Usage, [tenantId], budget, stores: null, ct);
    }

    public async Task<AiUsageReport> OwnedAsync(Guid userId, DateOnly anyDay, CancellationToken ct)
    {
        var owned = await memberships.OwnedTenantIdsAsync(userId, ct);
        var budgets = await db.Settings.IgnoreQueryFilters().AsNoTracking()
            .Where(s => owned.Contains(s.TenantId))
            .ToDictionaryAsync(s => s.TenantId, s => s.MonthlyBudgetMicroUsd, ct);
        var names = await tenancy.Tenants.AsNoTracking()
            .Where(t => owned.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Name, ct);

        var (start, end) = AiMonth.RangeUtc(anyDay);
        var spentByTenant = await db.Usage.IgnoreQueryFilters().AsNoTracking()
            .Where(u => owned.Contains(u.TenantId) && u.CreatedAtUtc >= start && u.CreatedAtUtc < end)
            .GroupBy(u => u.TenantId)
            .Select(g => new { g.Key, Spent = g.Sum(u => u.CostMicroUsd) })
            .ToDictionaryAsync(x => x.Key, x => x.Spent, ct);

        var stores = owned
            .Select(id => new AiUsageStore(id, names.GetValueOrDefault(id, "Tienda"),
                spentByTenant.GetValueOrDefault(id), budgets.GetValueOrDefault(id)))
            .OrderByDescending(s => s.SpentMicroUsd).ThenBy(s => s.Name)
            .ToList();

        // Único lugar que ignora el filtro de tienda; el Where explícito de BuildAsync lo acota a las propias.
        return await BuildAsync("owned", anyDay, db.Usage.IgnoreQueryFilters(), owned, stores.Sum(s => s.BudgetMicroUsd), stores, ct);
    }

    private async Task<AiUsageReport> BuildAsync(
        string scope, DateOnly anyDay, IQueryable<AiUsage> usage, IReadOnlyCollection<Guid> tenantIds, long budget,
        IReadOnlyList<AiUsageStore>? stores, CancellationToken ct)
    {
        var (start, end) = AiMonth.RangeUtc(anyDay);
        var month = usage.AsNoTracking()
            .Where(u => tenantIds.Contains(u.TenantId) && u.CreatedAtUtc >= start && u.CreatedAtUtc < end);

        var spent = await month.SumAsync(u => (long?)u.CostMicroUsd, ct) ?? 0;

        // Día argentino = UTC corrido el desfase; así las 22:00 del 31 (hora AR) no caen en el mes siguiente.
        var offset = ArgentinaTime.Offset;
        var days = await month
            .GroupBy(u => (u.CreatedAtUtc + offset).Date)
            .Select(g => new { Day = g.Key, Micro = g.Sum(u => u.CostMicroUsd) })
            .OrderBy(x => x.Day).ToListAsync(ct);
        var byTask = await month.GroupBy(u => u.Task)
            .Select(g => new { g.Key, Micro = g.Sum(u => u.CostMicroUsd) }).ToListAsync(ct);
        var byModel = await month.GroupBy(u => u.Model)
            .Select(g => new { g.Key, Micro = g.Sum(u => u.CostMicroUsd) }).ToListAsync(ct);
        var byUser = await month.GroupBy(u => u.UserId)
            .Select(g => new { g.Key, Micro = g.Sum(u => u.CostMicroUsd) }).ToListAsync(ct);

        var ids = byUser.Where(x => x.Key is not null).Select(x => x.Key!.Value).ToList();
        var people = await users.Users.AsNoTracking().Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName }).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        return new AiUsageReport(
            $"{anyDay.Year:D4}-{anyDay.Month:D2}",
            scope,
            budget,
            spent,
            [.. days.Select(d => new AiUsageDay(DateOnly.FromDateTime(d.Day), d.Micro))],
            [.. byTask.OrderByDescending(x => x.Micro).Select(x => new AiUsageSlice(x.Key.ToString(), x.Micro))],
            [.. byModel.OrderByDescending(x => x.Micro).Select(x => new AiUsageSlice(x.Key, x.Micro))],
            [.. byUser.OrderByDescending(x => x.Micro).Select(x => new AiUsageUser(x.Key, NameOf(x.Key, people), x.Micro))],
            stores);
    }

    // Nunca el email: sin nombre cargado, un texto genérico.
    private static string NameOf(Guid? userId, Dictionary<Guid, string> people) =>
        userId is null ? AutomaticName
        : people.GetValueOrDefault(userId.Value) is { } name && !string.IsNullOrWhiteSpace(name) ? name : UnknownName;
}
