using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCustomerTagsAndPurchaseStats : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "last_order_at_utc",
            table: "customers",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "orders_count",
            table: "customers",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<List<string>>(
            name: "tags",
            table: "customers",
            type: "text[]",
            nullable: false,
            defaultValueSql: "'{}'::text[]");

        migrationBuilder.AddColumn<long>(
            name: "total_spent_minor",
            table: "customers",
            type: "bigint",
            nullable: false,
            defaultValue: 0L);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "last_order_at_utc",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "orders_count",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "tags",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "total_spent_minor",
            table: "customers");
    }
}
