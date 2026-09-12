using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPriceLists : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "price_list_items",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                price_list_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                price_minor = table.Column<long>(type: "bigint", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_price_list_items", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "price_lists",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                based_on_price_list_id = table.Column<Guid>(type: "uuid", nullable: true),
                adjustment_percent = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: false),
                rounding = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                notes = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_price_lists", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_price_list_items_price_list_id_variant_id",
            table: "price_list_items",
            columns: new[] { "price_list_id", "variant_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_price_lists_tenant_id_active",
            table: "price_lists",
            columns: new[] { "tenant_id", "active" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "price_list_items");

        migrationBuilder.DropTable(
            name: "price_lists");
    }
}
