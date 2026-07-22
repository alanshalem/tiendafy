using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Manda el email de "pago confirmado" usando la plantilla editable del tenant
/// (confirmacion-pago). Si el merchant la desactivó, no envía. Sale envuelto
/// en el layout brandeado de la tienda.
/// </summary>
public sealed class OrderPaidNotifier(
    IEmailTemplates templates, BrandedEmailSender email, OrderItemImages images, TenancyDbContext tenancy)
{
    public async Task NotifyAsync(Order order, CancellationToken ct = default)
    {
        var storeName = await tenancy.Tenants
            .Where(t => t.Id == order.TenantId.Value)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "tu tienda";

        var imageMap = await images.ForOrderAsync(order, ct);
        var rendered = await templates.RenderAsync(
            order.TenantId.Value, "confirmacion-pago", OrderEmail.OrderVars(order, storeName, imageMap), ct);

        if (rendered is { Enabled: true })
            await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct);
    }
}
