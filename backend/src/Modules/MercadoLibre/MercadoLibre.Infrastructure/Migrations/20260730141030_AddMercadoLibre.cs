using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMercadoLibre : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "meli_connections",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                meli_user_id = table.Column<long>(type: "bigint", nullable: false),
                nickname = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                site_id = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                access_token_enc = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                refresh_token_enc = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                token_expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                stock_sync_enabled = table.Column<bool>(type: "boolean", nullable: false),
                connected_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_connections", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "meli_item_links",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                meli_item_id = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                meli_variation_id = table.Column<long>(type: "bigint", nullable: true),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                meli_title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                sync_stock = table.Column<bool>(type: "boolean", nullable: false),
                last_pushed_qty = table.Column<int>(type: "integer", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_item_links", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "meli_notifications",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                topic = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                resource = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                meli_user_id = table.Column<long>(type: "bigint", nullable: false),
                status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                attempts = table.Column<int>(type: "integer", nullable: false),
                last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                processed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_notifications", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "meli_orders",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                meli_order_id = table.Column<long>(type: "bigint", nullable: false),
                pack_id = table.Column<long>(type: "bigint", nullable: true),
                status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                date_created_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                date_closed_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                total_amount = table.Column<decimal>(type: "numeric", nullable: false),
                paid_amount = table.Column<decimal>(type: "numeric", nullable: false),
                currency_id = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                buyer_id = table.Column<long>(type: "bigint", nullable: false),
                buyer_nickname = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                items_json = table.Column<string>(type: "jsonb", nullable: false),
                shipment_id = table.Column<long>(type: "bigint", nullable: true),
                shipment_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                stock_applied = table.Column<bool>(type: "boolean", nullable: false),
                first_seen_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_orders", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_meli_connections_meli_user_id",
            table: "meli_connections",
            column: "meli_user_id");

        migrationBuilder.CreateIndex(
            name: "ix_meli_connections_tenant_id",
            table: "meli_connections",
            column: "tenant_id",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_meli_item_links_tenant_id_meli_item_id_meli_variation_id",
            table: "meli_item_links",
            columns: new[] { "tenant_id", "meli_item_id", "meli_variation_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_meli_item_links_tenant_id_variant_id",
            table: "meli_item_links",
            columns: new[] { "tenant_id", "variant_id" });

        migrationBuilder.CreateIndex(
            name: "ix_meli_notifications_status_created_at_utc",
            table: "meli_notifications",
            columns: new[] { "status", "created_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_meli_orders_tenant_id_date_created_utc",
            table: "meli_orders",
            columns: new[] { "tenant_id", "date_created_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_meli_orders_tenant_id_meli_order_id",
            table: "meli_orders",
            columns: new[] { "tenant_id", "meli_order_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "meli_connections");

        migrationBuilder.DropTable(
            name: "meli_item_links");

        migrationBuilder.DropTable(
            name: "meli_notifications");

        migrationBuilder.DropTable(
            name: "meli_orders");
    }
}
