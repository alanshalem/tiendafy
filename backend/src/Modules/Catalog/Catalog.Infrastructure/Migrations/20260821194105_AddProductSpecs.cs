using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddProductSpecs : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "product_specs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                definition_id = table.Column<Guid>(type: "uuid", nullable: false),
                value = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_product_specs", x => x.id);
                table.ForeignKey(
                    name: "fk_product_specs_products_product_id",
                    column: x => x.product_id,
                    principalTable: "products",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "spec_definitions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                unit = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                show_on_product = table.Column<bool>(type: "boolean", nullable: false),
                filterable = table.Column<bool>(type: "boolean", nullable: false),
                meli_attribute_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                category_ids = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                options = table.Column<List<string>>(type: "text[]", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_spec_definitions", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_product_specs_definition_id_value",
            table: "product_specs",
            columns: new[] { "definition_id", "value" });

        migrationBuilder.CreateIndex(
            name: "ix_product_specs_product_id_definition_id",
            table: "product_specs",
            columns: new[] { "product_id", "definition_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_spec_definitions_tenant_id_key",
            table: "spec_definitions",
            columns: new[] { "tenant_id", "key" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "product_specs");

        migrationBuilder.DropTable(
            name: "spec_definitions");
    }
}
