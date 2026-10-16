using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Emission;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;

namespace Api.Fiscal;

/// <summary>
/// Lo acreditado de la factura de una venta frente a lo devuelto, en centavos:
/// lo que el panel muestra en la venta ("Hay $X devueltos sin nota de
/// crédito") y lo que usa el filtro de Ventas.
/// </summary>
/// <param name="InvoiceTotal">Total de la factura (del ambiente actual).</param>
/// <param name="Credited">Notas de crédito autorizadas.</param>
/// <param name="InFlight">Notas de crédito en curso (en la cola o esperando a ARCA).</param>
/// <param name="Remaining">Lo que todavía se puede acreditar.</param>
/// <param name="Refunded">Lo devuelto de la venta.</param>
/// <param name="RefundedUncredited">Lo devuelto que ninguna nota de crédito (hecha o en curso) cubre, hasta lo que queda de la factura.</param>
public sealed record CreditSummary(
    long InvoiceTotal, long Credited, long InFlight, long Remaining, long Refunded, long RefundedUncredited);

/// <summary>Las cuentas de notas de crédito de las ventas de la tienda (orquesta Orders y Fiscal).</summary>
public static class OrderCreditNotes
{
    /// <summary>El valor del filtro de Ventas: facturadas con plata devuelta sin nota de crédito.</summary>
    public const string RefundedUncreditedFilter = "devueltas-sin-nc";

    public static CreditSummary Summarize(CreditNoteBalance balance, long refundedMinor)
    {
        var uncovered = refundedMinor - balance.CreditedMinor - balance.InFlightMinor;
        return new CreditSummary(
            balance.InvoiceTotalMinor, balance.CreditedMinor, balance.InFlightMinor, balance.RemainingMinor,
            refundedMinor, Math.Clamp(uncovered, 0, balance.RemainingMinor));
    }

    /// <summary>El resumen de una venta, o null si no tiene factura en el ambiente actual.</summary>
    public static async Task<CreditSummary?> ForOrderAsync(FiscalDbContext fiscal, Order order, CancellationToken ct)
    {
        var tenantId = order.TenantId.Value;
        var env = await EnvironmentAsync(fiscal, tenantId, ct);
        if (env is null) return null;
        var balance = await CreditNoteLedger.BalanceAsync(fiscal, tenantId, order.Id, env.Value, ct: ct);
        return balance is null ? null : Summarize(balance, order.RefundedAmount.AmountInMinorUnits);
    }

    /// <summary>
    /// Las ventas facturadas (en el ambiente actual) con plata devuelta que
    /// ninguna nota de crédito cubre. Las candidatas son pocas: facturadas y
    /// con algún reembolso.
    /// </summary>
    public static async Task<List<Guid>> RefundedUncreditedIdsAsync(
        FiscalDbContext fiscal, OrdersDbContext orders, Guid tenantId, CancellationToken ct)
    {
        var env = await EnvironmentAsync(fiscal, tenantId, ct);
        if (env is null) return [];

        CbteTipo[] invoices = [CbteTipo.FacturaA, CbteTipo.FacturaB, CbteTipo.FacturaC];
        var invoiced = await fiscal.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.Environment == env && d.OrderId != null
                        && d.Result == FiscalResult.Authorized && invoices.Contains(d.CbteTipo))
            .Select(d => d.OrderId!.Value).Distinct().ToListAsync(ct);
        if (invoiced.Count == 0) return [];

        var tenant = SharedKernel.Common.TenantId.From(tenantId);
        var refunded = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenant && invoiced.Contains(o.Id)
                        && (o.Status == OrderStatus.Refunded || o.Status == OrderStatus.PartiallyRefunded
                            || o.Status == OrderStatus.ChargedBack))
            .ToListAsync(ct);

        var ids = new List<Guid>();
        foreach (var order in refunded.Where(o => o.RefundedAmount.AmountInMinorUnits > 0))
        {
            var balance = await CreditNoteLedger.BalanceAsync(fiscal, tenantId, order.Id, env.Value, ct: ct);
            if (balance is not null && Summarize(balance, order.RefundedAmount.AmountInMinorUnits).RefundedUncredited > 0)
                ids.Add(order.Id);
        }
        return ids;
    }

    private static Task<FiscalEnvironment?> EnvironmentAsync(FiscalDbContext fiscal, Guid tenantId, CancellationToken ct) =>
        fiscal.Configs.AsNoTracking().Where(c => c.TenantId == tenantId)
            .Select(c => (FiscalEnvironment?)c.Environment).FirstOrDefaultAsync(ct);
}
