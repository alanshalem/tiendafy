using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPaymentOptionsAndFreeShipping : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "free_above",
            table: "shipping_methods",
            type: "character varying(24)",
            maxLength: 24,
            nullable: true);

        migrationBuilder.CreateTable(
            name: "payment_options",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                transfer_enabled = table.Column<bool>(type: "boolean", nullable: false),
                discount_percent = table.Column<int>(type: "integer", nullable: false),
                bank_name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                account_holder = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                holder_tax_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                cbu = table.Column<string>(type: "character varying(22)", maxLength: 22, nullable: true),
                alias = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                instructions = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                hold_hours = table.Column<int>(type: "integer", nullable: false, defaultValue: 48),
                cash_on_pickup_enabled = table.Column<bool>(type: "boolean", nullable: false),
                installments_max = table.Column<int>(type: "integer", nullable: false),
                installments_note = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_payment_options", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_payment_options_tenant_id",
            table: "payment_options",
            column: "tenant_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "payment_options");

        migrationBuilder.DropColumn(
            name: "free_above",
            table: "shipping_methods");
    }
}
