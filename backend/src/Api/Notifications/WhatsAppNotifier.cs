using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>
/// Manda el mensaje de WhatsApp de un evento de orden, si la tienda tiene la
/// Cloud API conectada Y ese tipo de mensaje activado con una plantilla de Meta
/// configurada. Best-effort: nunca rompe el flujo que lo dispara.
/// </summary>
public sealed class WhatsAppNotifier(
    NotificationsDbContext db,
    WhatsAppSender sender,
    WhatsAppTokenProtector protector,
    ILogger<WhatsAppNotifier> logger)
{
    private static string Money(SharedKernel.Common.Money m) => MoneyFormat.ForNotification(m);

    public async Task NotifyAsync(Order order, string type, CancellationToken ct = default)
    {
        try
        {
            var to = WhatsAppSender.NormalizeArPhone(order.BuyerPhone);
            if (to is null) return; // sin teléfono usable, no hay nada que mandar

            var setup = await ResolveAsync(order.TenantId.Value, type, ct);
            if (setup is null) return;
            var (conn, tpl) = setup.Value;

            var name = string.IsNullOrWhiteSpace(order.BuyerName)
                ? order.BuyerEmail.Split('@')[0]
                : order.BuyerName.Split(' ')[0];
            var shortId = order.Id.ToString("N")[..8].ToUpperInvariant();

            // Parámetros EN EL ORDEN que declara el catálogo para ese tipo
            // ({{1}}, {{2}}, … de la plantilla aprobada en Meta).
            IReadOnlyList<string> args = type switch
            {
                "confirmacion-envio" => [name, shortId, string.IsNullOrWhiteSpace(order.Tracking) ? "a coordinar" : order.Tracking!],
                "lista-para-retirar" => [name, shortId],
                _ => [name, shortId, Money(order.Total)],
            };

            await sender.SendTemplateAsync(
                conn.PhoneNumberId, protector.Unprotect(conn.AccessTokenEncrypted),
                to, tpl.MetaTemplateName, tpl.LanguageCode, args, ct);
            await CountAsync(order.TenantId.Value, type, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "WhatsApp notifier falló (orden {OrderId}, tipo {Type}).", order.Id, type);
        }
    }

    /// <summary>Para carritos abandonados (sin Order): nombre + tienda.</summary>
    public async Task NotifyAbandonedCartAsync(Guid tenantId, string? phone, string customerName, string storeName, CancellationToken ct = default)
    {
        try
        {
            var to = WhatsAppSender.NormalizeArPhone(phone);
            if (to is null) return;

            var setup = await ResolveAsync(tenantId, "carritos-abandonados", ct);
            if (setup is null) return;
            var (conn, tpl) = setup.Value;

            await sender.SendTemplateAsync(
                conn.PhoneNumberId, protector.Unprotect(conn.AccessTokenEncrypted),
                to, tpl.MetaTemplateName, tpl.LanguageCode, [customerName, storeName], ct);
            await CountAsync(tenantId, "carritos-abandonados", ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "WhatsApp carrito abandonado falló (tenant {TenantId}).", tenantId);
        }
    }

    /// <summary>Contador de uso (panel de costos). Best-effort: nunca rompe el envío.</summary>
    private async Task CountAsync(Guid tenantId, string template, CancellationToken ct)
    {
        try
        {
            db.NotificationEvents.Add(NotificationEvent.WhatsApp(tenantId, template));
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo registrar el envío de WhatsApp (tenant {TenantId}).", tenantId);
        }
    }

    /// <summary>Conexión + plantilla habilitada del tenant, o null si no corresponde enviar.</summary>
    private async Task<(WhatsAppConnection Conn, WhatsAppTemplate Tpl)?> ResolveAsync(Guid tenantId, string type, CancellationToken ct)
    {
        var conn = await db.WhatsAppConnections.AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (conn is null) return null;

        // Sin override no se envía: cada tipo arranca desactivado hasta que el
        // merchant cargue el nombre de su plantilla aprobada en Meta.
        var tpl = await db.WhatsAppTemplates.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.Type == type, ct);
        if (tpl is null || !tpl.Enabled || string.IsNullOrWhiteSpace(tpl.MetaTemplateName)) return null;

        return (conn, tpl);
    }
}
