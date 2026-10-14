using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Themes.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddThemeDraftVersion : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "draft_version",
            table: "themes",
            type: "integer",
            nullable: false,
            defaultValue: 0);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "draft_version",
            table: "themes");
    }
}
