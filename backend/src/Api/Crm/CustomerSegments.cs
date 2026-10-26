using Customers.Infrastructure;

namespace Api.Crm;

/// <summary>
/// Los segmentos de clientes que comparten la agenda del panel y el asistente.
/// Se apoyan en el resumen de compras que guarda cada ficha, así que se
/// resuelven en la base.
/// </summary>
public static class CustomerSegments
{
    /// <summary>Compró <paramref name="min"/> veces o más.</summary>
    public static IQueryable<Customer> MinOrders(IQueryable<Customer> q, int min) =>
        q.Where(c => c.OrdersCount >= min);

    /// <summary>
    /// Compró alguna vez y no desde <paramref name="sinceUtc"/>: el que nunca
    /// compró es otro segmento.
    /// </summary>
    public static IQueryable<Customer> InactiveSince(IQueryable<Customer> q, DateTime sinceUtc) =>
        q.Where(c => c.LastOrderAtUtc != null && c.LastOrderAtUtc < sinceUtc);

    /// <summary>Nunca compró.</summary>
    public static IQueryable<Customer> NeverBought(IQueryable<Customer> q) =>
        q.Where(c => c.OrdersCount == 0);
}
