using System.Linq.Expressions;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>
/// Qué checkouts siguen siendo un carrito abandonado. Lo usan el recordatorio
/// (<see cref="AbandonedCartWorker"/>) y la pantalla Carritos abandonados del
/// panel, así cuentan lo mismo.
///
/// <para>
/// Un comprador deja varias compras a medias en un mismo intento: la que se
/// arma cuando escribe su email, la de cada vez que toca "Pagar" (una tarjeta
/// rechazada y un segundo intento son dos). Antes cada una contaba sola: a
/// quien reintentaba y pagaba le llegaba igual "¿Te quedó algo en el
/// carrito?", y a quien elegía transferencia, mientras la orden esperaba el
/// pago. Ahora se mira al comprador (su email, en esa tienda), no la sesión.
/// </para>
/// </summary>
public static class AbandonedCarts
{
    public enum Outcome
    {
        /// <summary>No compró: le corresponde el recordatorio.</summary>
        Abandoned,
        /// <summary>Compró después (con esta compra o con otra), o dejó hecho un pedido a pagar a mano.</summary>
        Bought,
        /// <summary>Hay una compra suya más nueva en la misma tienda: el recordatorio, si toca, es de esa.</summary>
        Superseded,
    }

    /// <summary>
    /// Las órdenes que cierran un carrito: la plata entró (aunque después se
    /// haya devuelto o desconocido), o el pedido es de transferencia o efectivo,
    /// que ya tiene sus propios avisos (los datos para pagar, el vencimiento).
    /// Una de tarjeta o Mercado Pago sin cobrar (rechazada, o se fue sin pagar)
    /// no cierra nada.
    /// </summary>
    private static readonly Expression<Func<Order, bool>> ClosesCart = o =>
        OrderStatuses.Earning.Contains(o.Status)
        || o.Status == OrderStatus.Refunded
        || o.Status == OrderStatus.ChargedBack
        || Order.OfflineProviders.Contains(o.PaymentProvider);

    public static async Task<IReadOnlyDictionary<Guid, Outcome>> ClassifyAsync(
        IReadOnlyCollection<CheckoutSession> sessions, CheckoutDbContext checkoutDb, OrdersDbContext ordersDb,
        CancellationToken ct, TenantId? onlyTenant = null)
    {
        if (sessions.Count == 0) return new Dictionary<Guid, Outcome>();

        var since = sessions.Min(s => s.CreatedAtUtc);
        var ids = sessions.Select(s => s.Id).ToList();
        var emails = sessions.Where(s => s.Email != null).Select(s => Key(s.Email!)).Distinct().ToList();

        // La orden de la propia sesión (aunque haya pagado con otro email), o
        // una del mismo comprador hecha después.
        // Con onlyTenant (el listado del panel y el asistente) las dos lecturas
        // quedan acotadas a esa tienda aunque el filtro global esté apagado.
        var ordersQuery = ordersDb.Orders.AsNoTracking()
            .Where(o => o.CreatedAtUtc >= since
                && (ids.Contains(o.CheckoutSessionId) || emails.Contains(o.BuyerEmail.ToLower())))
            .Where(ClosesCart);
        if (onlyTenant is { } ordersTenant) ordersQuery = ordersQuery.Where(o => o.TenantId == ordersTenant);
        var orders = await ordersQuery
            .Select(o => new { o.TenantId, o.BuyerEmail, o.CheckoutSessionId, o.CreatedAtUtc })
            .ToListAsync(ct);

        var newerQuery = checkoutDb.Sessions.AsNoTracking()
            .Where(s => s.Email != null && s.CreatedAtUtc >= since && emails.Contains(s.Email.ToLower()));
        if (onlyTenant is { } newerTenant) newerQuery = newerQuery.Where(s => s.TenantId == newerTenant);
        var newer = emails.Count == 0
            ? []
            : await newerQuery
                .Select(s => new { s.Id, s.TenantId, s.Email, s.CreatedAtUtc })
                .ToListAsync(ct);

        var outcomes = new Dictionary<Guid, Outcome>(sessions.Count);
        foreach (var s in sessions)
        {
            var key = s.Email is null ? null : Key(s.Email);
            var bought = orders.Any(o => o.CheckoutSessionId == s.Id
                || (key != null && o.TenantId == s.TenantId && Key(o.BuyerEmail) == key && o.CreatedAtUtc >= s.CreatedAtUtc));
            var superseded = key != null && newer.Any(n => n.Id != s.Id && n.TenantId == s.TenantId
                && Key(n.Email!) == key && n.CreatedAtUtc > s.CreatedAtUtc);
            outcomes[s.Id] = bought ? Outcome.Bought : superseded ? Outcome.Superseded : Outcome.Abandoned;
        }
        return outcomes;
    }

    private static string Key(string email) => email.Trim().ToLowerInvariant();
}
