using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddShippingAndCheckoutDetails : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "buyer_last_name",
            table: "checkout_sessions",
            type: "character varying(80)",
            maxLength: 80,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "buyer_name",
            table: "checkout_sessions",
            type: "character varying(80)",
            maxLength: 80,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "doc_number",
            table: "checkout_sessions",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "notes",
            table: "checkout_sessions",
            type: "character varying(500)",
            maxLength: 500,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "phone",
            table: "checkout_sessions",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "shipping_address",
            table: "checkout_sessions",
            type: "character varying(300)",
            maxLength: 300,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "shipping_cost",
            table: "checkout_sessions",
            type: "character varying(24)",
            maxLength: 24,
            nullable: false,
            defaultValue: "0|ARS");

        migrationBuilder.AddColumn<Guid>(
            name: "shipping_method_id",
            table: "checkout_sessions",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "shipping_method_name",
            table: "checkout_sessions",
            type: "character varying(120)",
            maxLength: 120,
            nullable: true);

        migrationBuilder.CreateTable(
            name: "shipping_methods",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                price = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                pickup_address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_shipping_methods", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_shipping_methods_tenant_id_sort_order",
            table: "shipping_methods",
            columns: new[] { "tenant_id", "sort_order" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "shipping_methods");

        migrationBuilder.DropColumn(
            name: "buyer_last_name",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "buyer_name",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "doc_number",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "notes",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "phone",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "shipping_address",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "shipping_cost",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "shipping_method_id",
            table: "checkout_sessions");

        migrationBuilder.DropColumn(
            name: "shipping_method_name",
            table: "checkout_sessions");
    }
}
