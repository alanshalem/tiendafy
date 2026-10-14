using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <summary>
/// Número de pedido por tienda (#1001, #1002, …) y su contador.
///
/// Las ventas que ya existen se numeran en el orden en que se crearon (con el
/// id como desempate, para que dos del mismo instante no dependan del plan de
/// la consulta), y el contador de cada tienda arranca después de su última:
/// la primera venta nueva sigue la serie sin pisar ninguna.
/// </summary>
public partial class AddOrderNumbers : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "number",
            table: "orders",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.CreateTable(
            name: "order_number_counters",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                last_number = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_order_number_counters", x => x.tenant_id);
            });

        migrationBuilder.Sql("""
            UPDATE orders AS o
            SET number = n.seq + 1000
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at_utc, id) AS seq
                FROM orders
            ) AS n
            WHERE o.id = n.id;
            """);

        migrationBuilder.Sql("""
            INSERT INTO order_number_counters (tenant_id, last_number)
            SELECT tenant_id, MAX(number) FROM orders GROUP BY tenant_id;
            """);

        // El índice va después de numerar: con todas en 0, no se podía crear.
        migrationBuilder.CreateIndex(
            name: "ix_orders_tenant_id_number",
            table: "orders",
            columns: new[] { "tenant_id", "number" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "order_number_counters");

        migrationBuilder.DropIndex(
            name: "ix_orders_tenant_id_number",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "number",
            table: "orders");
    }
}
