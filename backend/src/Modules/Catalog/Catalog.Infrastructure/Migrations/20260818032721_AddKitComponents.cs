using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddKitComponents : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "kit_components",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                kit_variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                component_variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                quantity = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_kit_components", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_kit_components_tenant_id_kit_variant_id_component_variant_id",
            table: "kit_components",
            columns: new[] { "tenant_id", "kit_variant_id", "component_variant_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "kit_components");
    }
}
