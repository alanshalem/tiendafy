using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddOrderShippingAndBuyer : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "buyer_name",
            table: "orders",
            type: "character varying(170)",
            maxLength: 170,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "buyer_phone",
            table: "orders",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "doc_number",
            table: "orders",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "notes",
            table: "orders",
            type: "character varying(500)",
            maxLength: 500,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "shipping_address",
            table: "orders",
            type: "character varying(300)",
            maxLength: 300,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "shipping_cost",
            table: "orders",
            type: "character varying(24)",
            maxLength: 24,
            nullable: false,
            defaultValue: "0|ARS");

        migrationBuilder.AddColumn<string>(
            name: "shipping_method_name",
            table: "orders",
            type: "character varying(120)",
            maxLength: 120,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "buyer_name",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "buyer_phone",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "doc_number",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "notes",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "shipping_address",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "shipping_cost",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "shipping_method_name",
            table: "orders");
    }
}
