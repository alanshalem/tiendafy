using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Crm;

/// <summary>
/// Mantiene la agenda de clientes al día con lo que pasa en las ventas: cada
/// compra pagada deja (o completa) la ficha de su comprador.
///
/// Sin esto, "Clientes" mostraba únicamente a los que se habían registrado en
/// la tienda o se habían cargado a mano — el que compraba como invitado no
/// aparecía nunca, aunque su email estuviera en las ventas y las campañas de
/// email sí le llegaran. La pantalla mentía por omisión.
/// </summary>
public sealed class CustomerDirectory(
    CustomersDbContext db, OrdersDbContext orders, ILogger<CustomerDirectory> logger)
{
    /// <summary>
    /// Alta o actualización a partir de una venta. Devuelve true si dio de alta
    /// la ficha o le completó datos de contacto.
    /// </summary>
    /// <param name="restate">
    /// Recalcular también el resumen de compras. Quien procesa ventas de a
    /// miles ("Traer de mis ventas") lo apaga y llama una vez a
    /// <see cref="RestateAllAsync"/>: si no, serían miles de consultas.
    /// </param>
    public async Task<bool> UpsertFromOrderAsync(Order order, CancellationToken ct = default, bool restate = true)
    {
        var email = Normalize(order.BuyerEmail);
        if (email is null) return false;

        var tenantId = order.TenantId.Value;
        var existing = await FindByEmailAsync(tenantId, email, ct);

        if (existing is not null)
        {
            var filled = existing.FillMissingContact(order.BuyerName, order.BuyerPhone, order.ShippingAddress);
            // La venta que llega también cambia el resumen de compras (una más,
            // más gastado, última fecha): sin esto la columna "Compras" de la
            // agenda quedaba atrasada hasta que alguien abriera la ficha.
            var restated = restate && await RestateAsync(existing, ct);
            if (filled || restated) await db.SaveChangesAsync(ct);
            return filled;
        }

        // Sin nombre en la compra, el usuario de su email es mejor que "cliente".
        var name = string.IsNullOrWhiteSpace(order.BuyerName) ? email.Split('@')[0] : order.BuyerName;
        var created = Customer.Create(tenantId, name, email, order.BuyerPhone, order.ShippingAddress, null);
        if (created.IsFailure)
        {
            logger.LogWarning("No se pudo crear el cliente de la venta {OrderId}: {Error}",
                order.Id, created.Error.Code);
            return false;
        }

        if (restate) await RestateAsync(created.Value, ct);
        db.Customers.Add(created.Value);
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// Recalcula el resumen de compras del cliente de ese email (si está en la
    /// agenda). Para lo que cambia una venta ya cobrada: un reembolso o un
    /// contracargo bajan lo gastado sin que pase por <see cref="UpsertFromOrderAsync"/>.
    /// </summary>
    public async Task RefreshStatsAsync(Guid tenantId, string? buyerEmail, CancellationToken ct = default)
    {
        var email = Normalize(buyerEmail);
        if (email is null) return;
        var customer = await FindByEmailAsync(tenantId, email, ct);
        if (customer is not null && await RestateAsync(customer, ct))
            await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Recalcula el resumen de compras de toda la agenda de una tienda. Lo usan
    /// "Traer de mis ventas" y el relleno que corre una vez al aplicar la
    /// migración que creó las columnas. Una sola lectura de las ventas cobradas:
    /// los montos viven como texto "minor|CUR" y se suman en memoria, igual que
    /// en las audiencias de campañas.
    /// </summary>
    /// <returns>Cuántas fichas cambiaron.</returns>
    public async Task<int> RestateAllAsync(Guid tenantId, CancellationToken ct = default)
    {
        var tid = TenantId.From(tenantId);
        var earning = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status))
            .ToListAsync(ct);
        var byEmail = earning
            .GroupBy(o => Normalize(o.BuyerEmail))
            .Where(g => g.Key is not null)
            .ToDictionary(g => g.Key!, g => Summarize(g));

        var customers = await db.Customers.Where(c => c.TenantId == tenantId && c.Email != null).ToListAsync(ct);
        var changed = 0;
        foreach (var customer in customers)
        {
            var stats = byEmail.GetValueOrDefault(Normalize(customer.Email) ?? "");
            if (customer.SetPurchaseStats(stats.Count, stats.SpentMinor, stats.LastAtUtc))
                changed++;
        }
        if (changed > 0) await db.SaveChangesAsync(ct);
        return changed;
    }

    /// <summary>
    /// Pisa el resumen de compras de una ficha con lo que dicen sus ventas.
    /// Devuelve true si cambió (no guarda: lo hace quien llama).
    /// </summary>
    public async Task<bool> RestateAsync(Customer customer, CancellationToken ct = default)
    {
        var stats = Summarize(await EarningOrdersAsync(customer, ct));
        return customer.SetPurchaseStats(stats.Count, stats.SpentMinor, stats.LastAtUtc);
    }

    /// <summary>
    /// Las ventas de un cliente, de la más nueva a la más vieja (todas, no solo
    /// las cobradas: la ficha muestra también las pendientes y las canceladas).
    /// Se enlazan por email porque la venta no guarda el id de la ficha: el
    /// comprador invitado no tenía ficha al comprar.
    /// </summary>
    public async Task<List<Order>> OrdersOfAsync(Customer customer, int limit, CancellationToken ct = default)
    {
        var email = Normalize(customer.Email);
        if (email is null) return [];
        var tid = TenantId.From(customer.TenantId);
        return await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tid && o.BuyerEmail.ToLower() == email)
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(limit)
            .ToListAsync(ct);
    }

    /// <summary>Compras, gastado (neto de reembolsos) y la última fecha, de las ventas que cuentan como venta.</summary>
    public static PurchaseStats Summarize(IEnumerable<Order> source)
    {
        var earning = source.Where(o => OrderStatuses.IsEarning(o.Status)).ToList();
        return new PurchaseStats(
            earning.Count,
            earning.Sum(o => o.NetRevenue.AmountInMinorUnits),
            earning.Count == 0 ? null : earning.Max(o => o.PaidAtUtc ?? o.CreatedAtUtc),
            earning.Count == 0 ? null : earning.Min(o => o.PaidAtUtc ?? o.CreatedAtUtc));
    }

    private async Task<List<Order>> EarningOrdersAsync(Customer customer, CancellationToken ct)
    {
        var email = Normalize(customer.Email);
        if (email is null) return [];
        var tid = TenantId.From(customer.TenantId);
        return await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tid && o.BuyerEmail.ToLower() == email && OrderStatuses.Earning.Contains(o.Status))
            .ToListAsync(ct);
    }

    // Las fichas cargadas a mano guardan el email como se tipeó ("Juan@Mail.com"):
    // se compara en minúscula para no dejar afuera sus compras.
    private Task<Customer?> FindByEmailAsync(Guid tenantId, string email, CancellationToken ct) =>
        db.Customers.FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Email != null && c.Email.ToLower() == email, ct);

    /// <summary>
    /// El email con el que se identifica un comprador. El placeholder de las
    /// ventas manuales sin datos no es una persona a la que se le pueda escribir.
    /// </summary>
    private static string? Normalize(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(e) || !e.Contains('@') || e.EndsWith("@sin-email.local", StringComparison.Ordinal))
            return null;
        return e;
    }
}

/// <summary>Resumen de compras de un cliente. <c>default</c> = nunca compró.</summary>
public readonly record struct PurchaseStats(int Count, long SpentMinor, DateTime? LastAtUtc, DateTime? FirstAtUtc)
{
    /// <summary>Ticket promedio; 0 sin compras.</summary>
    public long AverageMinor => Count == 0 ? 0 : SpentMinor / Count;
}
