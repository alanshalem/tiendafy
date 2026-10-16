using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <summary>
/// Una sesión de checkout produce como mucho una venta (índice único sobre
/// <c>orders.checkout_session_id</c>). Total y no parcial: la columna no admite
/// null y las ventas que no nacen de un checkout (manuales, presupuestos, el
/// seed) llevan un id propio que no se repite.
///
/// <para>
/// Antes del índice, un doble pedido de pago sobre la misma sesión podía crear
/// dos ventas. Si hubiera alguna así en la base, crear el índice fallaría y
/// trabaría el deploy, así que primero se separan: por sesión se queda con el
/// id la venta que más importa (cobrada, después reembolsada, después
/// pendiente, después el resto; a igualdad, la más vieja) y las demás reciben
/// un id de sesión nuevo. No se borra nada: esas ventas siguen en el panel
/// como estaban, solo dejan de apuntar a la sesión. Cuántas se separaron sale
/// como WARNING en el log de la migración.
/// </para>
/// </summary>
public partial class UniqueOrderPerCheckoutSession : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            DECLARE moved integer;
            BEGIN
                WITH ranked AS (
                    SELECT id, row_number() OVER (
                        PARTITION BY checkout_session_id
                        ORDER BY CASE status
                                     WHEN 'Paid' THEN 0
                                     WHEN 'Fulfilled' THEN 0
                                     WHEN 'PartiallyRefunded' THEN 0
                                     WHEN 'Refunded' THEN 1
                                     WHEN 'ChargedBack' THEN 1
                                     WHEN 'PendingPayment' THEN 2
                                     ELSE 3
                                 END,
                                 created_at_utc, id) AS rn
                    FROM orders)
                UPDATE orders o
                SET checkout_session_id = gen_random_uuid()
                FROM ranked r
                WHERE r.id = o.id AND r.rn > 1;
                GET DIAGNOSTICS moved = ROW_COUNT;
                IF moved > 0 THEN
                    RAISE WARNING 'orders: % venta(s) duplicada(s) de una misma sesión de checkout quedaron con un id de sesión nuevo antes de crear ix_orders_checkout_session_id.', moved;
                END IF;
            END $$;
            """);

        migrationBuilder.CreateIndex(
            name: "ix_orders_checkout_session_id",
            table: "orders",
            column: "checkout_session_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_orders_checkout_session_id",
            table: "orders");
    }
}
