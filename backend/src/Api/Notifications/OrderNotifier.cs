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
    public Task NotifyAsync(Order order, string templateKey, CancellationToken ct = default) =>
        NotifyAsync(order, templateKey, null, ct);

    /// <param name="extraVars">Variables propias de una plantilla (ej. los datos de la transferencia), ya en HTML seguro.</param>
    public async Task NotifyAsync(
        Order order, string templateKey, IReadOnlyDictionary<string, string>? extraVars, CancellationToken ct = default)
    {
        var storeName = await tenancy.Tenants
            .Where(t => t.Id == order.TenantId.Value)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "tu tienda";

        var imageMap = await images.ForOrderAsync(order, ct);
        var vars = OrderEmail.OrderVars(order, storeName, imageMap);
        if (extraVars is not null)
            vars = vars.Concat(extraVars).GroupBy(kv => kv.Key).ToDictionary(g => g.Key, g => g.Last().Value);
        var rendered = await templates.RenderAsync(order.TenantId.Value, templateKey, vars, ct);

        if (rendered is { Enabled: true })
            await email.SendAsync(order.TenantId.Value, order.BuyerEmail, rendered.Subject, rendered.Html, ct);
    }
}
