using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddOrderRefundTracking : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "refunded_amount",
            table: "orders",
            type: "character varying(24)",
            maxLength: 24,
            nullable: false,
            defaultValue: "0|ARS");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "refunded_amount",
            table: "orders");
    }
}
