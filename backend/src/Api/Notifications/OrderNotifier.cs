using Api.Orders;
using Microsoft.AspNetCore.DataProtection;
using Notifications.Infrastructure;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>
/// Envía un email de pedido usando cualquier plantilla editable del tenant
/// (confirmacion-envio, cancelacion-compra, etc.). Si está desactivada, no envía.
/// Sale envuelto en el layout brandeado de la tienda.
/// </summary>
public sealed class OrderNotifier(
    IEmailTemplates templates, BrandedEmailSender email, OrderItemImages images, StoreLinks links,
    IDataProtectionProvider dp)
{
    /// <returns>Si salió el email: false si la plantilla está apagada.</returns>
    public Task<bool> NotifyAsync(Order order, string templateKey, CancellationToken ct = default) =>
        NotifyAsync(order, templateKey, null, ct);

    /// <param name="extraVars">Variables propias de una plantilla (ej. los datos de la transferencia), ya en HTML seguro.</param>
    /// <param name="attachments">Adjuntos (la factura en PDF).</param>
    public async Task<bool> NotifyAsync(
        Order order, string templateKey, IReadOnlyDictionary<string, string>? extraVars, CancellationToken ct = default,
        IReadOnlyList<EmailAttachment>? attachments = null)
    {
        var store = await links.ForTenantAsync(order.TenantId.Value, "https", ct);
        var storeName = store?.Name ?? "tu tienda";

        // "Seguí tu pedido" con el link firmado: abre ese pedido sin pedir nada.
        var trackingLink = store is null
            ? null
            : $"{store.Url}/seguimiento?t={Uri.EscapeDataString(OrderTrackingToken.Protect(dp, order.TenantId.Value, order.Id))}";

        var imageMap = await images.ForOrderAsync(order, ct);
        var vars = OrderEmail.OrderVars(order, storeName, imageMap, trackingLink);
        if (extraVars is not null)
            vars = vars.Concat(extraVars).GroupBy(kv => kv.Key).ToDictionary(g => g.Key, g => g.Last().Value);
        var rendered = await templates.RenderAsync(order.TenantId.Value, templateKey, vars, ct);

        if (rendered is not { Enabled: true }) return false;
        await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct,
            attachments: attachments);
        return true;
    }
}
