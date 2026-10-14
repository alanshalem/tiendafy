using System.Net;
using System.Text;
using Api.Notifications;
using Catalog.Contracts;
using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notifications.Infrastructure;
using Purchasing.Infrastructure;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>Una variante bajo su punto de reposición (o bajo el mínimo que le puso la tienda).</summary>
public sealed record LowStockItem(
    Guid VariantId, Guid? ProductId, string Product, string Variant, string Sku,
    int Available, int? CoverageDays, decimal? UnitsPerDay, int SuggestedQty, int? ReorderPoint,
    string Reason, int? MinUnits);

/// <summary>Quién recibe los avisos por email.</summary>
public sealed record StockAlertRecipient(Guid UserId, string Name, string Email, bool OptedOut);

/// <summary>Lo que dejó una pasada: cuántas variantes cruzaron, cuántas se avisaron y a cuántas personas.</summary>
public sealed record StockAlertRun(int Low, int Crossed, int Notified, int Recipients);

/// <summary>
/// Alertas de stock bajo: qué está bajo (la señal de reposición de Compras
/// más los mínimos propios de cada variante), el registro de cada cruce y el
/// email al equipo.
///
/// <para>
/// Se avisa UNA vez por cruce: el estado de cada variante recuerda si ya se
/// avisó, y el aviso se reclama fila por fila con un UPDATE condicional antes
/// de mandarse (con dos instancias de la Api, una sola lo manda). Si el email
/// no sale para nadie, el reclamo se devuelve y se reintenta en la próxima
/// pasada.
/// </para>
///
/// <para>
/// Lo reciben quienes hacen las compras (permiso "Compras e importaciones":
/// es la acción a la que lleva el aviso), menos quien se dio de baja y los
/// emails en la lista de bajas de la tienda. No hay WhatsApp: la integración
/// existente le escribe al comprador con plantillas aprobadas por Meta, y el
/// equipo no tiene teléfono cargado. En el panel, el aviso es el contador de
/// "Stock bajo" del menú.
/// </para>
/// </summary>
public sealed class StockAlertService(
    PurchasingDbContext db,
    ReorderSignal signal,
    IStockRepository stock,
    ICatalogCheckoutQuery catalog,
    IAccessService access,
    AppIdentityDbContext identity,
    NotificationsDbContext notifications,
    BrandedEmailSender emails,
    IMemoryCache cache,
    IConfiguration configuration,
    ILogger<StockAlertService> logger)
{
    private static readonly TimeSpan CountCacheFor = TimeSpan.FromMinutes(2);

    private static string CountKey(Guid tenantId) => $"stock-alerts:count:{tenantId:N}";

    /// <summary>
    /// Lo que está bajo ahora mismo, sin lo silenciado. Ordenado por urgencia:
    /// lo que se agota primero arriba.
    /// </summary>
    public async Task<IReadOnlyList<LowStockItem>> LowAsync(TenantId tenantId, CancellationToken ct)
    {
        var tid = tenantId.Value;
        var rules = await db.StockAlertRules.AsNoTracking().Where(r => r.TenantId == tid).ToListAsync(ct);
        var ruleByVariant = rules.ToDictionary(r => r.VariantId);

        var reorder = await signal.SuggestionsAsync(tenantId, null, ct, take: 1000);
        var low = new Dictionary<Guid, LowStockItem>();
        foreach (var r in reorder.Items)
        {
            var rule = ruleByVariant.GetValueOrDefault(r.VariantId);
            if (rule?.Muted == true) continue;
            low[r.VariantId] = new LowStockItem(
                r.VariantId, r.ProductId, r.Product, r.Variant, r.Sku, r.Available,
                r.CoverageDays, r.UnitsPerDay, r.SuggestedQty, r.ReorderPoint,
                StockAlertState.ReasonReorder, rule?.MinUnits);
        }

        // Mínimos propios: avisan aunque la variante no se haya vendido en 60
        // días (la señal de reposición no la ve sin ventas).
        var minimums = rules.Where(r => r.MinUnits is not null && !r.Muted).ToList();
        if (minimums.Count > 0)
        {
            var ids = minimums.Select(r => r.VariantId).ToList();
            var available = (await stock.GetByVariantsAsync(tenantId, ids, ct)).ToDictionary(s => s.VariantId, s => s.Available);
            var below = minimums.Where(r => available.GetValueOrDefault(r.VariantId) <= r.MinUnits!.Value && !low.ContainsKey(r.VariantId)).ToList();
            var names = below.Count == 0
                ? []
                : (await catalog.GetVariantsAsync(tid, [.. below.Select(r => r.VariantId)], ct)).ToDictionary(v => v.VariantId);
            foreach (var r in below)
            {
                var units = available.GetValueOrDefault(r.VariantId);
                var v = names.GetValueOrDefault(r.VariantId);
                if (v is null) continue; // variante borrada: la regla quedó huérfana
                low[r.VariantId] = new LowStockItem(
                    r.VariantId, v.ProductId, v.ProductName, v.VariantDescription, v.Sku, units,
                    null, null,
                    // Reponer hasta el doble del mínimo: un pedido que deja el
                    // stock justo arriba del umbral vuelve a avisar enseguida.
                    Math.Max(1, (r.MinUnits!.Value * 2) - units), null,
                    StockAlertState.ReasonMinimum, r.MinUnits);
            }
        }

        return [.. low.Values.OrderBy(i => i.CoverageDays ?? 0).ThenBy(i => i.Available)];
    }

    /// <summary>Cuántas variantes están bajas (para el menú; cache corto por tienda).</summary>
    public async Task<int> CountAsync(TenantId tenantId, CancellationToken ct)
    {
        if (cache.TryGetValue(CountKey(tenantId.Value), out int cached)) return cached;
        var count = (await LowAsync(tenantId, ct)).Count;
        cache.Set(CountKey(tenantId.Value), count, CountCacheFor);
        return count;
    }

    /// <summary>Después de cambiar una regla, el contador del menú se vuelve a calcular.</summary>
    public void InvalidateCount(Guid tenantId) => cache.Remove(CountKey(tenantId));

    /// <summary>
    /// Una pasada sobre una tienda: anota los cruces y las reposiciones, y si
    /// toca (inmediato, o la hora del resumen diario) avisa lo pendiente.
    /// </summary>
    public async Task<StockAlertRun> EvaluateAsync(TenantId tenantId, DateTime nowUtc, CancellationToken ct)
    {
        var tid = tenantId.Value;
        var settings = await db.StockAlertSettings.FirstOrDefaultAsync(s => s.TenantId == tid, ct);
        if (settings is null || settings.Mode == StockAlertMode.Off) return new StockAlertRun(0, 0, 0, 0);

        var low = await LowAsync(tenantId, ct);
        cache.Set(CountKey(tid), low.Count, CountCacheFor);
        var lowById = low.ToDictionary(i => i.VariantId);

        var states = await db.StockAlertStates.Where(s => s.TenantId == tid).ToListAsync(ct);
        var byVariant = states.ToDictionary(s => s.VariantId);
        var crossed = 0;
        foreach (var item in low)
        {
            if (!byVariant.TryGetValue(item.VariantId, out var state))
            {
                state = StockAlertState.Create(tid, item.VariantId);
                db.StockAlertStates.Add(state);
                byVariant[item.VariantId] = state;
            }
            if (state.ObserveLow(item.Reason, item.Available, item.SuggestedQty, nowUtc)) crossed++;
        }
        foreach (var state in byVariant.Values.Where(s => s.IsLow && !lowById.ContainsKey(s.VariantId)))
            state.ObserveRecovered(nowUtc);
        await db.SaveChangesAsync(ct);

        var digest = settings.Mode == StockAlertMode.Daily;
        if (digest && !DigestDue(settings, nowUtc)) return new StockAlertRun(low.Count, crossed, 0, 0);

        var pending = byVariant.Values.Where(s => s.PendingNotification).ToList();
        var claimed = new List<StockAlertState>();
        foreach (var state in pending)
        {
            // Claim por fila: si otra instancia ya lo avisó, el WHERE no da.
            var won = await db.StockAlertStates
                .Where(s => s.Id == state.Id && s.IsLow && s.NotifiedAtUtc == null)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.NotifiedAtUtc, nowUtc), ct);
            if (won == 1) claimed.Add(state);
        }

        if (digest)
        {
            settings.DigestSent(nowUtc);
            await db.SaveChangesAsync(ct);
        }
        if (claimed.Count == 0) return new StockAlertRun(low.Count, crossed, 0, 0);

        var recipients = (await RecipientsAsync(tid, ct)).Where(r => !r.OptedOut).ToList();
        var sent = await SendAsync(tid, recipients, [.. claimed.Select(s => lowById[s.VariantId])], digest, ct);
        if (sent == 0 && recipients.Count > 0)
        {
            // No salió para nadie (Resend caído): se devuelve el reclamo y la
            // próxima pasada lo vuelve a intentar.
            var ids = claimed.Select(s => s.Id).ToList();
            await db.StockAlertStates
                .Where(s => ids.Contains(s.Id))
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.NotifiedAtUtc, (DateTime?)null), ct);
            return new StockAlertRun(low.Count, crossed, 0, 0);
        }
        return new StockAlertRun(low.Count, crossed, claimed.Count, sent);
    }

    /// <summary>Hora de Argentina pasada la elegida, y todavía sin resumen hoy.</summary>
    public static bool DigestDue(StockAlertSettings settings, DateTime nowUtc)
    {
        var local = nowUtc.AddHours(-3);
        if (local.Hour < settings.DigestHourLocal) return false;
        return settings.LastDigestAtUtc is not { } last || last.AddHours(-3).Date < local.Date;
    }

    /// <summary>
    /// Quienes compran (permiso de Compras), con su baja personal marcada. Los
    /// emails en la lista de bajas de la tienda directamente no figuran.
    /// </summary>
    public async Task<IReadOnlyList<StockAlertRecipient>> RecipientsAsync(Guid tenantId, CancellationToken ct)
    {
        var members = await access.MembersAsync(tenantId, ct);
        var buyers = members.Where(m => m.Value.Can(Permission.PurchasingManage)).Select(m => m.Key).ToList();
        if (buyers.Count == 0) return [];

        var users = await identity.Users.AsNoTracking()
            .Where(u => buyers.Contains(u.Id) && u.Email != null)
            .Select(u => new { u.Id, u.DisplayName, u.Email })
            .ToListAsync(ct);
        var optedOut = (await db.StockAlertOptOuts.AsNoTracking()
                .Where(o => o.TenantId == tenantId)
                .Select(o => o.UserId)
                .ToListAsync(ct))
            .ToHashSet();
        var suppressed = (await notifications.EmailSuppressions.AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Email)
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return [.. users
            .Where(u => !suppressed.Contains(u.Email!))
            .Select(u => new StockAlertRecipient(
                u.Id, string.IsNullOrWhiteSpace(u.DisplayName) ? u.Email! : u.DisplayName, u.Email!, optedOut.Contains(u.Id)))
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)];
    }

    private async Task<int> SendAsync(
        Guid tenantId, IReadOnlyList<StockAlertRecipient> recipients, IReadOnlyList<LowStockItem> items,
        bool digest, CancellationToken ct)
    {
        var subject = items.Count == 1
            ? $"Stock bajo: {items[0].Product}"
            : $"Stock bajo: {items.Count} productos para reponer";
        var html = Html(items, digest, configuration["Admin:BaseUrl"]);

        var sent = 0;
        foreach (var r in recipients)
        {
            try
            {
                await emails.SendAsync(tenantId, r.Email, subject, html, ct, template: "stock-bajo");
                sent++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "No salió el aviso de stock bajo a un miembro del tenant {TenantId}.", tenantId);
            }
        }
        return sent;
    }

    private static string Html(IReadOnlyList<LowStockItem> items, bool digest, string? adminBaseUrl)
    {
        var rows = new StringBuilder();
        foreach (var i in items)
        {
            var name = i.Variant is "" or "Única" ? i.Product : $"{i.Product} · {i.Variant}";
            var why = i.Reason == StockAlertState.ReasonMinimum
                ? $"mínimo {i.MinUnits}"
                : i.CoverageDays is { } days ? $"alcanza {days} días" : "";
            rows.Append($"<tr><td style='padding:6px 8px;border-bottom:1px solid #eee'>{WebUtility.HtmlEncode(name)}"
                + $"<br><span style='color:#888;font-size:12px'>{WebUtility.HtmlEncode(i.Sku)}</span></td>"
                + $"<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>{i.Available}</td>"
                + $"<td style='padding:6px 8px;border-bottom:1px solid #eee;color:#888;font-size:12px'>{WebUtility.HtmlEncode(why)}</td>"
                + $"<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'><strong>{i.SuggestedQty}</strong></td></tr>");
        }

        var link = string.IsNullOrWhiteSpace(adminBaseUrl)
            ? "<p style='margin:16px 0 0;color:#555'>Lo ves en el panel, en Productos › Stock bajo, con el botón para armar la orden de compra.</p>"
            : $"<p style='margin:16px 0 0'><a href='{WebUtility.HtmlEncode(adminBaseUrl.TrimEnd('/'))}/productos/stock-bajo' "
              + "style='background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px'>Ver y armar la compra</a></p>";

        return $@"<h2 style='margin:0 0 8px;font-size:20px'>{(digest ? "Resumen de stock bajo" : "Hay productos para reponer")}</h2>
<p style='margin:0 0 12px;color:#555'>Con lo que se viene vendiendo, esto se agota antes de que llegue la próxima compra (o ya está por debajo del mínimo que le pusiste).</p>
<table style='width:100%;border-collapse:collapse;font-size:14px'>
<tr style='text-align:left;color:#888;font-size:12px'><th style='padding:6px 8px'>Producto</th><th style='padding:6px 8px;text-align:right'>Stock</th><th style='padding:6px 8px'></th><th style='padding:6px 8px;text-align:right'>Pedir</th></tr>
{rows}</table>
{link}
<p style='color:#8b8b8b;font-size:12px;margin-top:16px'>Te avisamos una vez por producto cuando cruza su punto de reposición. Podés dejar de recibir estos emails desde la pantalla Stock bajo.</p>";
    }
}
