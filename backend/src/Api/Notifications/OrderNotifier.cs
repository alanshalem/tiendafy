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
        var vars = await VarsAsync(order, extraVars, ct);
        var rendered = await templates.RenderAsync(order.TenantId.Value, templateKey, vars, ct);

        if (rendered is not { Enabled: true }) return false;
        await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct,
            attachments: attachments);
        return true;
    }

    /// <summary>
    /// Un aviso que el comprador no puede dejar de recibir (su venta se canceló,
    /// le devolvieron parte de la plata): con la plantilla de la tienda si la
    /// prendió y, si no, con el texto de fábrica de esa misma plantilla. Prenderla
    /// sirve para mandar el texto propio, no para decidir si sale.
    /// </summary>
    /// <param name="fallback">
    /// El texto para cuando la plantilla está apagada, si el de fábrica de esa
    /// plantilla no cuenta lo que pasó (la venta que se canceló sola porque
    /// venció el plazo para pagar). Lleva las mismas variables ({{order_id}}…).
    /// </param>
    public async Task NotifyWithDefaultAsync(
        Order order, string templateKey, IReadOnlyDictionary<string, string>? extraVars, CancellationToken ct = default,
        DefaultEmailText? fallback = null)
    {
        var vars = await VarsAsync(order, extraVars, ct);
        var rendered = await templates.RenderAsync(order.TenantId.Value, templateKey, vars, ct);
        if (rendered is null) return;

        if (!rendered.Enabled)
        {
            var def = EmailTemplateCatalog.Find(templateKey)!;
            var text = fallback ?? new DefaultEmailText(def.DefaultSubject, def.DefaultBody);
            rendered = new RenderedEmail(true,
                System.Net.WebUtility.HtmlDecode(EmailTemplates.Substitute(text.Subject, vars)),
                EmailTemplates.Substitute(text.Body, vars));
        }
        await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct);
    }

    private async Task<IReadOnlyDictionary<string, string>> VarsAsync(
        Order order, IReadOnlyDictionary<string, string>? extraVars, CancellationToken ct)
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
        return vars;
    }
}

/// <summary>Asunto y cuerpo (HTML con variables {{...}}) de un aviso cuando la plantilla de la tienda está apagada.</summary>
public sealed record DefaultEmailText(string Subject, string Body);
