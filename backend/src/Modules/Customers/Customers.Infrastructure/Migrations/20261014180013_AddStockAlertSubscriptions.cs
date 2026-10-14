using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddStockAlertSubscriptions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "stock_alert_subscriptions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                notified_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                cancelled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stock_alert_subscriptions", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_subscriptions_tenant_id_notified_at_utc_cancell",
            table: "stock_alert_subscriptions",
            columns: new[] { "tenant_id", "notified_at_utc", "cancelled_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_subscriptions_tenant_id_product_id",
            table: "stock_alert_subscriptions",
            columns: new[] { "tenant_id", "product_id" });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_subscriptions_tenant_id_variant_id_email",
            table: "stock_alert_subscriptions",
            columns: new[] { "tenant_id", "variant_id", "email" },
            unique: true,
            filter: "notified_at_utc IS NULL AND cancelled_at_utc IS NULL");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "stock_alert_subscriptions");
    }
}
