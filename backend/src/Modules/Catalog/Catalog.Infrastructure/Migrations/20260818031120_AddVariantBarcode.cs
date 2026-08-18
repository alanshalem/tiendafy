using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddVariantBarcode : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "barcode",
            table: "product_variants",
            type: "character varying(64)",
            maxLength: 64,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_product_variants_barcode",
            table: "product_variants",
            column: "barcode");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_product_variants_barcode",
            table: "product_variants");

        migrationBuilder.DropColumn(
            name: "barcode",
            table: "product_variants");
    }
}
