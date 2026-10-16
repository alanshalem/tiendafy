using Api.Notifications;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Fiscal;

/// <summary>
/// El email "factura" de la tienda, con el PDF adjunto, cuando una venta
/// obtiene su CAE; y el "nota-credito", con el suyo, por cada nota de crédito
/// de la venta. La plantilla existía en el catálogo y nadie la mandaba.
///
/// <para>
/// Es orquestación (Fiscal + Orders + Notifications) y por eso vive en Api.
/// Sale una sola vez por factura aunque la terminen dos caminos (el worker y
/// el botón "Facturar", o un job que se da por hecho porque otro ya la
/// facturó): se reclama con un UPDATE condicional sobre el comprobante. No
/// sale si el comprobante es de homologación (de prueba, sin validez fiscal),
/// si la tienda no prendió la plantilla (viene apagada), si la venta no
/// es de la tienda (Mercado Libre) o si el comprador no dejó email (las de
/// mostrador llevan un <c>@sin-email.local</c> de relleno). Best-effort: un
/// email caído no puede tirar abajo una factura que ya tiene CAE.
/// </para>
/// </summary>
public sealed class InvoiceEmail(
    FiscalDbContext fiscal,
    IOrderRepository orders,
    IEmailTemplates templates,
    IComprobantePdfRenderer pdf,
    OrderNotifier notifier,
    ILogger<InvoiceEmail> logger)
{
    public const string Template = "factura";

    /// <summary>La plantilla de la nota de crédito, con su PDF, igual que la factura.</summary>
    public const string CreditNoteTemplate = "nota-credito";

    /// <returns>Si salió el email.</returns>
    public async Task<bool> SendAsync(Guid tenantId, Guid documentId, CancellationToken ct = default)
    {
        try
        {
            return await TrySendAsync(tenantId, documentId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "No se pudo mandar el email de la factura {Document} (tenant {Tenant}).", documentId, tenantId);
            return false;
        }
    }

    private async Task<bool> TrySendAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var doc = await fiscal.Documents.AsNoTracking()
            .FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Id == documentId, ct);
        if (doc is not { Result: FiscalResult.Authorized, OrderId: { } orderId, BuyerNotifiedAtUtc: null })
            return false;
        // Un comprobante de homologación es de prueba, sin validez fiscal: no se
        // le manda al comprador. Tampoco se marca como enviado: si la venta se
        // factura después en producción, ese comprobante sí sale.
        if (doc.Environment == FiscalEnvironment.Homologacion) return false;
        var template = OrderComprobantePresenter.IsNc(doc.CbteTipo) ? CreditNoteTemplate : Template;

        // Una venta de Mercado Libre no es una orden de la tienda: no está acá.
        var order = await orders.GetByIdAsync(TenantId.From(tenantId), orderId, ct);
        if (order is null
            || string.IsNullOrWhiteSpace(order.BuyerEmail)
            || order.BuyerEmail.EndsWith("@sin-email.local", StringComparison.OrdinalIgnoreCase))
            return false;

        // Apagada (lo normal: viene así de fábrica): ni se reclama ni se arma el PDF.
        var enabled = await templates.RenderAsync(tenantId, template, new Dictionary<string, string>(), ct);
        if (enabled is not { Enabled: true }) return false;

        var cfg = await fiscal.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null) return false;

        var claimed = await fiscal.Documents
            .Where(d => d.TenantId == tenantId && d.Id == documentId && d.BuyerNotifiedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.BuyerNotifiedAtUtc, DateTime.UtcNow), ct);
        if (claimed == 0) return false; // otro camino ya lo mandó

        var (bytes, fileName) = OrderInvoicePdf.Render(pdf, doc, order, cfg);
        return await notifier.NotifyAsync(order, template, extraVars: null, ct, [new EmailAttachment(fileName, bytes)]);
    }
}
