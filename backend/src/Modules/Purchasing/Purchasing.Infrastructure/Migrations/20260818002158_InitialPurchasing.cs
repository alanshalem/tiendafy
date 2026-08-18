using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Purchasing.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialPurchasing : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "purchase_orders",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                supplier_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                reference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                exchange_rate = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                lead_time_days = table.Column<int>(type: "integer", nullable: true),
                status = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                confirmed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                received_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_purchase_orders", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "purchase_expenses",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                is_local = table.Column<bool>(type: "boolean", nullable: false),
                purchase_order_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_purchase_expenses", x => x.id);
                table.ForeignKey(
                    name: "fk_purchase_expenses_purchase_orders_purchase_order_id",
                    column: x => x.purchase_order_id,
                    principalTable: "purchase_orders",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "purchase_order_items",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                variant_description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                sku = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                quantity = table.Column<int>(type: "integer", nullable: false),
                unit_cost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                received_quantity = table.Column<int>(type: "integer", nullable: true),
                purchase_order_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_purchase_order_items", x => x.id);
                table.ForeignKey(
                    name: "fk_purchase_order_items_purchase_orders_purchase_order_id",
                    column: x => x.purchase_order_id,
                    principalTable: "purchase_orders",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_purchase_expenses_purchase_order_id",
            table: "purchase_expenses",
            column: "purchase_order_id");

        migrationBuilder.CreateIndex(
            name: "ix_purchase_order_items_purchase_order_id",
            table: "purchase_order_items",
            column: "purchase_order_id");

        migrationBuilder.CreateIndex(
            name: "ix_purchase_orders_tenant_id_created_at_utc",
            table: "purchase_orders",
            columns: new[] { "tenant_id", "created_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_purchase_orders_tenant_id_status",
            table: "purchase_orders",
            columns: new[] { "tenant_id", "status" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "purchase_expenses");

        migrationBuilder.DropTable(
            name: "purchase_order_items");

        migrationBuilder.DropTable(
            name: "purchase_orders");
    }
}
