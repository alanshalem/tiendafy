using Api.Auth;
using Api.Purchasing;
using Catalog.Contracts;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Alertas de stock bajo (ver <see cref="StockAlertService"/>). Ver la lista y
/// darse de baja de los emails es de quien ve el stock; cambiar cuándo avisa
/// la tienda, los mínimos y silenciar productos, de quien ajusta el stock.
/// </summary>
public static class StockAlertEndpoints
{
    public static RouteGroupBuilder MapStockAlertEndpoints(this RouteGroupBuilder group)
    {
        var alerts = group.MapGroup("/stock-alerts").RequireTenant();

        // Lo que está bajo ahora, con cuándo cruzó y si ya se avisó.
        alerts.MapGet("/", async (
            ITenantContext tenant, StockAlertService service, PurchasingDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var low = await service.LowAsync(tenant.TenantId, ct);
            var states = await db.StockAlertStates.AsNoTracking()
                .Where(s => s.TenantId == tid && s.IsLow)
                .ToDictionaryAsync(s => s.VariantId, ct);
            var settings = await db.StockAlertSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tid, ct);

            return Results.Ok(new
            {
                mode = settings?.Mode ?? StockAlertMode.Off,
                total = low.Count,
                items = low.Select(i => new
                {
                    i.VariantId,
                    i.ProductId,
                    i.Product,
                    i.Variant,
                    i.Sku,
                    i.Available,
                    i.CoverageDays,
                    i.UnitsPerDay,
                    i.SuggestedQty,
                    i.ReorderPoint,
                    i.Reason,
                    i.MinUnits,
                    crossedAtUtc = states.GetValueOrDefault(i.VariantId)?.CrossedAtUtc,
                    notifiedAtUtc = states.GetValueOrDefault(i.VariantId)?.NotifiedAtUtc,
                }),
            });
        }).RequirePermission(Permission.InventoryRead);

        // El número del menú lateral (con cache corto: se pide cada minuto).
        alerts.MapGet("/count", async (ITenantContext tenant, StockAlertService service, CancellationToken ct) =>
            Results.Ok(new { count = await service.CountAsync(tenant.TenantId, ct) }))
            .RequirePermission(Permission.InventoryRead);

        alerts.MapGet("/settings", async (
            HttpContext http, ITenantContext tenant, StockAlertService service, PurchasingDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var settings = await db.StockAlertSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tid, ct);
            var recipients = await service.RecipientsAsync(tid, ct);
            var me = http.User.GetUserId();
            var mine = recipients.FirstOrDefault(r => r.UserId == me);
            return Results.Ok(new
            {
                mode = settings?.Mode ?? StockAlertMode.Off,
                digestHour = settings?.DigestHourLocal ?? 9,
                lastDigestAtUtc = settings?.LastDigestAtUtc,
                recipients = recipients.Select(r => new { r.UserId, r.Name, r.Email, r.OptedOut }),
                // Si la persona está en la lista (tiene Compras) y si se dio de baja.
                me = new { receives = mine is { OptedOut: false }, eligible = mine is not null, optedOut = mine?.OptedOut ?? false },
            });
        }).RequirePermission(Permission.InventoryRead);

        alerts.MapPut("/settings", async (
            StockAlertSettingsRequest request, ITenantContext tenant, PurchasingDbContext db, CancellationToken ct) =>
        {
            if (!StockAlertMode.IsValid(request.Mode))
                return Error.Validation("StockAlerts.BadMode", "Elegí inmediato, resumen diario o sin avisos.").ToProblem();
            var tid = tenant.TenantId.Value;
            var settings = await db.StockAlertSettings.FirstOrDefaultAsync(s => s.TenantId == tid, ct);
            if (settings is null)
            {
                settings = StockAlertSettings.Create(tid);
                db.StockAlertSettings.Add(settings);
            }
            settings.Configure(request.Mode!, request.DigestHour ?? settings.DigestHourLocal);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { mode = settings.Mode, digestHour = settings.DigestHourLocal });
        }).RequirePermission(Permission.InventoryWrite);

        // La baja (o el alta) de la propia persona: no hace falta poder
        // configurar la tienda para dejar de recibir un email.
        alerts.MapPut("/settings/me", async (
            StockAlertOptOutRequest request, HttpContext http, ITenantContext tenant, PurchasingDbContext db, CancellationToken ct) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var tid = tenant.TenantId.Value;
            var existing = await db.StockAlertOptOuts.FirstOrDefaultAsync(o => o.TenantId == tid && o.UserId == userId, ct);
            if (request.OptOut && existing is null) db.StockAlertOptOuts.Add(StockAlertOptOut.Create(tid, userId.Value));
            if (!request.OptOut && existing is not null) db.StockAlertOptOuts.Remove(existing);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { /* doble click: ya quedó como pedía */ }
            return Results.Ok(new { optedOut = request.OptOut });
        }).RequirePermission(Permission.InventoryRead);

        // Mínimos propios y silenciados (para la pantalla de configuración).
        alerts.MapGet("/rules", async (
            ITenantContext tenant, PurchasingDbContext db, ICatalogCheckoutQuery catalog, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var rules = await db.StockAlertRules.AsNoTracking().Where(r => r.TenantId == tid).ToListAsync(ct);
            var names = rules.Count == 0
                ? []
                : (await catalog.GetVariantsAsync(tid, [.. rules.Select(r => r.VariantId)], ct)).ToDictionary(v => v.VariantId);
            return Results.Ok(new
            {
                items = rules
                    .Where(r => names.ContainsKey(r.VariantId))
                    .Select(r => new
                    {
                        r.VariantId,
                        product = names[r.VariantId].ProductName,
                        variant = names[r.VariantId].VariantDescription,
                        sku = names[r.VariantId].Sku,
                        r.MinUnits,
                        r.Muted,
                    })
                    .OrderBy(r => r.product, StringComparer.OrdinalIgnoreCase),
            });
        }).RequirePermission(Permission.InventoryRead);

        alerts.MapPut("/rules/{variantId:guid}", async (
            Guid variantId, StockAlertRuleRequest request, ITenantContext tenant, PurchasingDbContext db,
            ICatalogCheckoutQuery catalog, StockAlertService service, CancellationToken ct) =>
        {
            if (request.MinUnits is < 0 or > 1_000_000)
                return Error.Validation("StockAlerts.BadMinimum", "El mínimo va de 0 a 1.000.000 unidades.").ToProblem();
            var tid = tenant.TenantId.Value;
            if ((await catalog.GetVariantsAsync(tid, [variantId], ct)).Count == 0) return Results.NotFound();

            var rule = await db.StockAlertRules.FirstOrDefaultAsync(r => r.TenantId == tid && r.VariantId == variantId, ct);
            if (rule is null)
            {
                rule = StockAlertRule.Create(tid, variantId);
                db.StockAlertRules.Add(rule);
            }
            rule.Set(request.MinUnits, request.Muted);
            if (rule.IsDefault) db.StockAlertRules.Remove(rule);
            await db.SaveChangesAsync(ct);
            service.InvalidateCount(tid);
            return Results.Ok(new { variantId, minUnits = rule.MinUnits, muted = rule.Muted });
        }).RequirePermission(Permission.InventoryWrite);

        return group;
    }
}

/// <summary>Cuándo avisa la tienda: "off", "inmediato" o "diario" (a la hora de Argentina indicada).</summary>
public sealed record StockAlertSettingsRequest(string? Mode, int? DigestHour);

public sealed record StockAlertOptOutRequest(bool OptOut);

/// <summary>Mínimo propio (null = usar solo la señal de reposición) y silenciar.</summary>
public sealed record StockAlertRuleRequest(int? MinUnits, bool Muted);
