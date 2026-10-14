using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Purchasing.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddStockAlerts : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "stock_alert_opt_outs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                user_id = table.Column<Guid>(type: "uuid", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stock_alert_opt_outs", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "stock_alert_rules",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                min_units = table.Column<int>(type: "integer", nullable: true),
                muted = table.Column<bool>(type: "boolean", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stock_alert_rules", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "stock_alert_settings",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                mode = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                digest_hour_local = table.Column<int>(type: "integer", nullable: false),
                next_run_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                last_digest_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stock_alert_settings", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "stock_alert_states",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                is_low = table.Column<bool>(type: "boolean", nullable: false),
                crossed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                notified_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                recovered_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                reason = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                available = table.Column<int>(type: "integer", nullable: false),
                suggested_qty = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stock_alert_states", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_opt_outs_tenant_id_user_id",
            table: "stock_alert_opt_outs",
            columns: new[] { "tenant_id", "user_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_rules_tenant_id_variant_id",
            table: "stock_alert_rules",
            columns: new[] { "tenant_id", "variant_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_settings_mode_next_run_at_utc",
            table: "stock_alert_settings",
            columns: new[] { "mode", "next_run_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_settings_tenant_id",
            table: "stock_alert_settings",
            column: "tenant_id",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_states_tenant_id_is_low",
            table: "stock_alert_states",
            columns: new[] { "tenant_id", "is_low" });

        migrationBuilder.CreateIndex(
            name: "ix_stock_alert_states_tenant_id_variant_id",
            table: "stock_alert_states",
            columns: new[] { "tenant_id", "variant_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "stock_alert_opt_outs");

        migrationBuilder.DropTable(
            name: "stock_alert_rules");

        migrationBuilder.DropTable(
            name: "stock_alert_settings");

        migrationBuilder.DropTable(
            name: "stock_alert_states");
    }
}
