using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddVariantShippingSize : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "height_cm",
            table: "product_variants",
            type: "integer",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "length_cm",
            table: "product_variants",
            type: "integer",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "weight_grams",
            table: "product_variants",
            type: "integer",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "width_cm",
            table: "product_variants",
            type: "integer",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "height_cm",
            table: "product_variants");

        migrationBuilder.DropColumn(
            name: "length_cm",
            table: "product_variants");

        migrationBuilder.DropColumn(
            name: "weight_grams",
            table: "product_variants");

        migrationBuilder.DropColumn(
            name: "width_cm",
            table: "product_variants");
    }
}
