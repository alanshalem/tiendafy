using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliOrderStockReverted : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "stock_reverted",
            table: "meli_orders",
            type: "boolean",
            nullable: false,
            defaultValue: false);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "stock_reverted",
            table: "meli_orders");
    }
}
