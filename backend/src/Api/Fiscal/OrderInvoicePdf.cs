using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Api.Fiscal;

/// <summary>
/// El PDF del comprobante autorizado de una venta (con el QR de ARCA). Lo
/// descargan el panel y el comprador desde su cuenta, y va adjunto en el email
/// "factura": un solo armado, así todos ven exactamente el mismo papel.
/// </summary>
public static class OrderInvoicePdf
{
    /// <summary>
    /// El archivo, o NotFound si la venta no tiene ese comprobante autorizado
    /// en el ambiente en que factura la tienda. Una factura de homologación no
    /// tiene validez fiscal: en producción no se ofrece como la de la venta.
    /// </summary>
    public static async Task<IResult> DownloadAsync(
        FiscalDbContext fiscalDb, IComprobantePdfRenderer pdf,
        Guid tenantId, Guid orderId, Order? order, bool creditNote, CancellationToken ct, Guid? documentId = null)
    {
        var cfg = await fiscalDb.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null) return Results.NotFound();

        var docs = await fiscalDb.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.OrderId == orderId && d.Environment == cfg.Environment
                        && d.Result == FiscalResult.Authorized)
            .OrderByDescending(d => d.CreatedAtUtc).ToListAsync(ct);
        // Un comprobante puntual (una de las NC de la venta), o el último del tipo.
        var doc = documentId is { } wanted
            ? docs.FirstOrDefault(d => d.Id == wanted)
            : docs.FirstOrDefault(d => OrderComprobantePresenter.IsNc(d.CbteTipo) == creditNote);
        if (doc is null) return Results.NotFound();

        var (bytes, fileName) = Render(pdf, doc, order, cfg);
        return Results.File(bytes, "application/pdf", fileName);
    }

    /// <summary>El archivo de un comprobante ya cargado, con su nombre.</summary>
    public static (byte[] Bytes, string FileName) Render(
        IComprobantePdfRenderer pdf, FiscalDocument doc, Order? order, FiscalConfig cfg) =>
        (pdf.Render(OrderComprobantePresenter.BuildPdfData(doc, order, cfg)),
         $"comprobante-{doc.PtoVta:0000}-{doc.Number:00000000}.pdf");
}
