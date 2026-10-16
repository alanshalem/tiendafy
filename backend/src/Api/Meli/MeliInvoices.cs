using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// Qué comprobante cuenta como la factura de una venta de Mercado Libre: solo
/// el del ambiente en que factura hoy la tienda. Una factura de homologación
/// es de prueba y no existe para ARCA de producción: la venta sigue "sin
/// facturar" y se puede facturar de verdad, igual que una venta de la tienda.
/// Lo usan el listado, sus filtros, el contador del Inicio, el botón
/// "Facturar" y la auto-factura (orquesta Mercado Libre y Fiscal).
/// </summary>
public static class MeliInvoices
{
    /// <summary>
    /// Los comprobantes que, vinculados a una venta, no cuentan como su
    /// factura: los de otro ambiente. Son pocos (en producción, las pruebas de
    /// homologación). Sin la facturación configurada no hay con qué comparar y
    /// cuenta lo vinculado.
    /// </summary>
    public static async Task<List<Guid?>> NotCountingAsync(FiscalDbContext fiscal, Guid tenantId, CancellationToken ct)
    {
        var env = await EnvironmentAsync(fiscal, tenantId, ct);
        if (env is null) return [];
        return await fiscal.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.OrderId != null && d.Environment != env)
            .Select(d => (Guid?)d.Id)
            .ToListAsync(ct);
    }

    /// <summary>¿El comprobante vinculado a la venta cuenta como su factura (es del ambiente actual)?</summary>
    public static async Task<bool> CountsAsync(FiscalDbContext fiscal, Guid tenantId, Guid? documentId, CancellationToken ct)
    {
        if (documentId is not { } id) return false;
        var env = await EnvironmentAsync(fiscal, tenantId, ct);
        if (env is null) return true;
        return await fiscal.Documents.AsNoTracking()
            .AnyAsync(d => d.TenantId == tenantId && d.Id == id && d.Environment == env, ct);
    }

    /// <summary>En qué ambiente factura hoy la tienda (null sin configurar).</summary>
    public static Task<FiscalEnvironment?> EnvironmentAsync(FiscalDbContext fiscal, Guid tenantId, CancellationToken ct) =>
        fiscal.Configs.AsNoTracking().Where(c => c.TenantId == tenantId)
            .Select(c => (FiscalEnvironment?)c.Environment).FirstOrDefaultAsync(ct);
}
