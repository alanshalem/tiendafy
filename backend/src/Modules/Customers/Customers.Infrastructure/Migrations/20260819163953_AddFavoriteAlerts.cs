using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddFavoriteAlerts : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "last_alert_at_utc",
            table: "customer_favorites",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "was_out_of_stock",
            table: "customer_favorites",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<long>(
            name: "watched_price_minor",
            table: "customer_favorites",
            type: "bigint",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "last_alert_at_utc",
            table: "customer_favorites");

        migrationBuilder.DropColumn(
            name: "was_out_of_stock",
            table: "customer_favorites");

        migrationBuilder.DropColumn(
            name: "watched_price_minor",
            table: "customer_favorites");
    }
}
