using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddOrderProfitFields : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "mp_fee_amount",
            table: "orders",
            type: "character varying(24)",
            maxLength: 24,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "unit_cost",
            table: "order_items",
            type: "character varying(24)",
            maxLength: 24,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "mp_fee_amount",
            table: "orders");

        migrationBuilder.DropColumn(
            name: "unit_cost",
            table: "order_items");
    }
}
