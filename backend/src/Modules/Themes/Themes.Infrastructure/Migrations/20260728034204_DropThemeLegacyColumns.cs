using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Themes.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropThemeLegacyColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "announcement",
                table: "themes");

            migrationBuilder.DropColumn(
                name: "sections_json",
                table: "themes");

            migrationBuilder.DropColumn(
                name: "tokens_json",
                table: "themes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "announcement",
                table: "themes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "sections_json",
                table: "themes",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "tokens_json",
                table: "themes",
                type: "jsonb",
                nullable: false,
                defaultValue: "");
        }
    }
}
