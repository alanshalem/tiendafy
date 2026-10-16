using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliOrderStockDeductions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "stock_deductions_json",
            table: "meli_orders",
            type: "jsonb",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "stock_deductions_json",
            table: "meli_orders");
    }
}
