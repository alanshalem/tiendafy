using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliPriceSync : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(
            name: "last_pushed_price_minor",
            table: "meli_item_links",
            type: "bigint",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "sync_price",
            table: "meli_item_links",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<decimal>(
            name: "price_markup_pct",
            table: "meli_connections",
            type: "numeric",
            nullable: false,
            defaultValue: 0m);

        migrationBuilder.AddColumn<bool>(
            name: "price_sync_enabled",
            table: "meli_connections",
            type: "boolean",
            nullable: false,
            defaultValue: false);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "last_pushed_price_minor",
            table: "meli_item_links");

        migrationBuilder.DropColumn(
            name: "sync_price",
            table: "meli_item_links");

        migrationBuilder.DropColumn(
            name: "price_markup_pct",
            table: "meli_connections");

        migrationBuilder.DropColumn(
            name: "price_sync_enabled",
            table: "meli_connections");
    }
}
