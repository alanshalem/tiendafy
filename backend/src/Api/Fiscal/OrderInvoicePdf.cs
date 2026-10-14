using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Api.Fiscal;

/// <summary>
/// El PDF del comprobante autorizado de una venta (con el QR de ARCA). Lo
/// descargan el panel y el comprador desde su cuenta: un solo armado, así los
/// dos ven exactamente el mismo papel.
/// </summary>
public static class OrderInvoicePdf
{
    /// <summary>El archivo, o NotFound si la venta no tiene ese comprobante autorizado.</summary>
    public static async Task<IResult> DownloadAsync(
        FiscalDbContext fiscalDb, IComprobantePdfRenderer pdf,
        Guid tenantId, Guid orderId, Order? order, bool creditNote, CancellationToken ct)
    {
        var docs = await fiscalDb.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.OrderId == orderId && d.Result == FiscalResult.Authorized)
            .OrderByDescending(d => d.CreatedAtUtc).ToListAsync(ct);
        var doc = docs.FirstOrDefault(d => OrderComprobantePresenter.IsNc(d.CbteTipo) == creditNote);
        if (doc is null) return Results.NotFound();

        var cfg = await fiscalDb.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null) return Results.NotFound();

        var bytes = pdf.Render(OrderComprobantePresenter.BuildPdfData(doc, order, cfg));
        return Results.File(bytes, "application/pdf", $"comprobante-{doc.PtoVta:0000}-{doc.Number:00000000}.pdf");
    }
}
