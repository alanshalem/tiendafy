using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliProductAttributes : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "meli_product_attributes",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                attribute_id = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                value_id = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                value_name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_product_attributes", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "meli_product_categories",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                category_id = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                category_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_meli_product_categories", x => new { x.tenant_id, x.product_id });
            });

        migrationBuilder.CreateIndex(
            name: "ix_meli_product_attributes_tenant_id_product_id_attribute_id",
            table: "meli_product_attributes",
            columns: new[] { "tenant_id", "product_id", "attribute_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "meli_product_attributes");

        migrationBuilder.DropTable(
            name: "meli_product_categories");
    }
}
