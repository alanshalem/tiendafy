using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Infrastructure.Persistence;

public sealed class OrderRepository(OrdersDbContext context) : IOrderRepository
{
    public Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == id, ct);

    // Cross-tenant a propósito (settle del webhook, cuyo orderId ya viene de un
    // evento con firma validada). Ignora el filtro global explícitamente.
    public Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default) =>
        context.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Order?> GetByNumberAsync(TenantId tenantId, int number, CancellationToken ct = default) =>
        context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Number == number, ct);

    public async Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default)
    {
        var e = email.Trim().ToLowerInvariant();
        return await context.Orders
            .Where(o => o.TenantId == tenantId && o.BuyerEmail.ToLower() == e)
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(100)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default)
    {
        var query = context.Orders.Where(o => o.TenantId == tenantId).OrderByDescending(o => o.CreatedAtUtc).AsQueryable();
        if (afterId.HasValue)
        {
            var after = await context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == afterId.Value, ct);
            if (after is not null)
                query = query.Where(o => o.CreatedAtUtc < after.CreatedAtUtc);
        }
        return await query.Take(limit).ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(
        TenantId tenantId, int limit, int offset, OrderListFilter filter, CancellationToken ct = default)
    {
        var query = Filtered(tenantId, filter);
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(o => o.CreatedAtUtc)
            .Skip(offset)
            .Take(limit)
            .ToListAsync(ct);
        return (items, total);
    }

    public IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, OrderListFilter filter) =>
        Filtered(tenantId, filter)
            .AsNoTracking()
            .OrderByDescending(o => o.CreatedAtUtc)
            .ThenBy(o => o.Id)
            .AsAsyncEnumerable();

    public Task<int> CountAsync(TenantId tenantId, OrderListFilter filter, CancellationToken ct = default) =>
        Filtered(tenantId, filter).CountAsync(ct);

    /// <summary>
    /// La búsqueda y los filtros del listado. Uno solo para la página, el
    /// export y los contadores: el archivo tiene que traer exactamente lo que
    /// se ve, y el número del Inicio, lo que aparece al tocarlo.
    /// </summary>
    private IQueryable<Order> Filtered(TenantId tenantId, OrderListFilter filter)
    {
        var query = context.Orders.Where(o => o.TenantId == tenantId);

        if (filter.Ids is { Count: > 0 } ids)
            query = query.Where(o => ids.Contains(o.Id));

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var wanted = filter.Status.Trim().ToUpperInvariant();
            query = query.Where(o => o.Status.ToString().ToUpper() == wanted);
        }

        if (filter.FromUtc is { } from) query = query.Where(o => o.CreatedAtUtc >= from);
        if (filter.ToUtc is { } to) query = query.Where(o => o.CreatedAtUtc < to);

        if (!string.IsNullOrWhiteSpace(filter.Channel))
        {
            var channel = filter.Channel.Trim().ToLowerInvariant();
            query = query.Where(o => o.Channel == channel);
        }

        query = filter.Shipping switch
        {
            OrderShipping.ToDispatch => query.Where(o => o.Status == OrderStatus.Paid && !o.IsPickup),
            OrderShipping.ToPrepareForPickup => query.Where(o => o.Status == OrderStatus.Paid && o.IsPickup),
            OrderShipping.Sent => query.Where(o => o.FulfilledAtUtc != null && !o.IsPickup),
            OrderShipping.ReadyForPickup => query.Where(o => o.FulfilledAtUtc != null && o.IsPickup),
            _ => query,
        };

        switch (filter.Payment)
        {
            case OrderPayment.Gateway:
                // Lo cobrado por la pasarela y lo que espera un link de pago.
                query = query.Where(o =>
                    (o.PaymentId != null && !o.PaymentId.StartsWith(OrderPayment.ManualPrefix))
                    || (o.PaymentId == null && o.PreferenceId != null));
                break;
            case OrderPayment.Cash or OrderPayment.Transfer or OrderPayment.CurrentAccount:
                var paymentId = OrderPayment.ManualPaymentId(filter.Payment);
                query = query.Where(o => o.PaymentId == paymentId);
                break;
        }

        // El número se muestra como "#1042": quien lo copia de la tabla, de un
        // WhatsApp o de una etiqueta lo pega con el numeral.
        var text = filter.Search?.Trim().TrimStart('#').Trim();
        if (!string.IsNullOrEmpty(text))
        {
            var term = $"%{text}%";
            // Un número entero busca ESE pedido (exacto: "104" no tiene que
            // traer el 1041 al 1049), además de lo que coincida como texto.
            var number = OrderLabel.ParseNumber(text);
            // Email, nombre del comprador, el número de pedido o el principio
            // del id (las etiquetas viejas llevan el id corto).
            query = query.Where(o =>
                (number != null && o.Number == number)
                || EF.Functions.ILike(o.BuyerEmail, term)
                || (o.BuyerName != null && EF.Functions.ILike(o.BuyerName, term))
                || EF.Functions.ILike(o.Id.ToString(), term));
        }

        return query;
    }

    public async Task AddAsync(Order order, CancellationToken ct = default) =>
        await context.Orders.AddAsync(order, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => context.SaveChangesAsync(ct);
}
