using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliOrderRefunds : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(
            name: "refund_credit_resolved_minor_units",
            table: "meli_orders",
            type: "bigint",
            nullable: false,
            defaultValue: 0L);

        migrationBuilder.AddColumn<decimal>(
            name: "refunded_amount",
            table: "meli_orders",
            type: "numeric",
            nullable: false,
            defaultValue: 0m);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "refund_credit_resolved_minor_units",
            table: "meli_orders");

        migrationBuilder.DropColumn(
            name: "refunded_amount",
            table: "meli_orders");
    }
}
