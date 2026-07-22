using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Envía un email de pedido usando cualquier plantilla editable del tenant
/// (confirmacion-envio, cancelacion-compra, etc.). Si está desactivada, no envía.
/// Sale envuelto en el layout brandeado de la tienda.
/// </summary>
public sealed class OrderNotifier(
    IEmailTemplates templates, BrandedEmailSender email, OrderItemImages images, TenancyDbContext tenancy)
{
    public async Task NotifyAsync(Order order, string templateKey, CancellationToken ct = default)
    {
        var storeName = await tenancy.Tenants
            .Where(t => t.Id == order.TenantId.Value)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "tu tienda";

        var imageMap = await images.ForOrderAsync(order, ct);
        var rendered = await templates.RenderAsync(
            order.TenantId.Value, templateKey, OrderEmail.OrderVars(order, storeName, imageMap), ct);

        if (rendered is { Enabled: true })
            await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct);
    }
}
