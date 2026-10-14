using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Orders.Infrastructure.Persistence;

/// <summary>
/// El último número de pedido que dio cada tienda. Una fila por tienda.
///
/// Por qué una fila y no MAX(number)+1 ni una secuencia de Postgres: el MAX
/// repite número cuando dos checkouts pagan en el mismo instante (los dos leen
/// el mismo máximo), y una secuencia es global, no por tienda. El upsert de
/// abajo incrementa y devuelve en UNA sentencia; Postgres bloquea la fila hasta
/// que termina la transacción, así que dos ventas simultáneas de la misma
/// tienda se ordenan solas y nunca reciben el mismo número. El índice único
/// (tenant, number) de orders queda como red por si alguien escribe a mano.
/// </summary>
public sealed class OrderNumberCounter
{
    public Guid TenantId { get; private set; }
    public int LastNumber { get; private set; }

    private OrderNumberCounter() { } // EF Core

    /// <summary>
    /// Reserva <paramref name="count"/> números seguidos para la tienda y
    /// devuelve el primero. Si la venta que los pidió no llega a guardarse, el
    /// número se pierde (queda un salto): es un número de atención, no un
    /// comprobante fiscal, y un salto no confunde a nadie; repetirlo sí.
    /// </summary>
    internal static async Task<int> ReserveAsync(DbContext db, Guid tenantId, int count, CancellationToken ct)
    {
        var first = OrderLabel.FirstNumber;
        var last = await db.Database.SqlQuery<int>($"""
            INSERT INTO order_number_counters (tenant_id, last_number)
            VALUES ({tenantId}, {first - 1 + count})
            ON CONFLICT (tenant_id) DO UPDATE
                SET last_number = order_number_counters.last_number + {count}
            RETURNING last_number AS "Value"
            """).ToListAsync(ct);
        return last[0] - count + 1;
    }
}
