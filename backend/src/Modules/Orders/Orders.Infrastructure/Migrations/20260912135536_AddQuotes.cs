using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddQuotes : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "quotes",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                customer_id = table.Column<Guid>(type: "uuid", nullable: true),
                customer_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                customer_email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                valid_until_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                discount_amount = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                rejection_reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                converted_order_id = table.Column<Guid>(type: "uuid", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                sent_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                decided_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_quotes", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "quote_items",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                variant_description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                sku = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                unit_price = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                quantity = table.Column<int>(type: "integer", nullable: false),
                quote_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_quote_items", x => x.id);
                table.ForeignKey(
                    name: "fk_quote_items_quotes_quote_id",
                    column: x => x.quote_id,
                    principalTable: "quotes",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_quote_items_quote_id",
            table: "quote_items",
            column: "quote_id");

        migrationBuilder.CreateIndex(
            name: "ix_quotes_tenant_id_created_at_utc",
            table: "quotes",
            columns: new[] { "tenant_id", "created_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_quotes_tenant_id_number",
            table: "quotes",
            columns: new[] { "tenant_id", "number" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "quote_items");

        migrationBuilder.DropTable(
            name: "quotes");
    }
}
