using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Payments.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPaywayConnection : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "payway_connections",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                site_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                environment = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                public_key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                private_key_encrypted = table.Column<string>(type: "text", nullable: false),
                base_url_override = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                establishment_name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                installment_options = table.Column<List<int>>(type: "integer[]", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_payway_connections", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "payway_payment_attempts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                attempt_number = table.Column<int>(type: "integer", nullable: false),
                site_transaction_id = table.Column<string>(type: "character varying(39)", maxLength: 39, nullable: false),
                provider_payment_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                raw_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                amount_minor = table.Column<long>(type: "bigint", nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                installments = table.Column<int>(type: "integer", nullable: false),
                card_bin = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: true),
                card_last_four = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                card_brand = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                payment_method_id = table.Column<int>(type: "integer", nullable: true),
                authorization_code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                network_transaction_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                ticket_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                decline_code = table.Column<int>(type: "integer", nullable: true),
                decline_description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                processed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_payway_payment_attempts", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_payway_connections_tenant_id",
            table: "payway_connections",
            column: "tenant_id",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_payway_payment_attempts_tenant_id_order_id",
            table: "payway_payment_attempts",
            columns: new[] { "tenant_id", "order_id" });

        migrationBuilder.CreateIndex(
            name: "ix_payway_payment_attempts_tenant_id_order_id_attempt_number",
            table: "payway_payment_attempts",
            columns: new[] { "tenant_id", "order_id", "attempt_number" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_payway_payment_attempts_tenant_id_site_transaction_id",
            table: "payway_payment_attempts",
            columns: new[] { "tenant_id", "site_transaction_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "payway_connections");

        migrationBuilder.DropTable(
            name: "payway_payment_attempts");
    }
}
