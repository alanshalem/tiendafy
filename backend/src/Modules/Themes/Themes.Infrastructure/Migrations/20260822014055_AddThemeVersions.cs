using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Themes.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddThemeVersions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "theme_versions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                config = table.Column<string>(type: "jsonb", nullable: false),
                published_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                published_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_theme_versions", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_theme_versions_tenant_id_published_at_utc",
            table: "theme_versions",
            columns: new[] { "tenant_id", "published_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "theme_versions");
    }
}
