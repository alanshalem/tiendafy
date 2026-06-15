using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Themes.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ThemeDraftPublished : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "draft_config",
                table: "themes",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "published_config",
                table: "themes",
                type: "jsonb",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "draft_config",
                table: "themes");

            migrationBuilder.DropColumn(
                name: "published_config",
                table: "themes");
        }
    }
}
