using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Themes.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddThemeSchedule : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "scheduled_at_utc",
            table: "themes",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "scheduled_config",
            table: "themes",
            type: "jsonb",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "scheduled_at_utc",
            table: "themes");

        migrationBuilder.DropColumn(
            name: "scheduled_config",
            table: "themes");
    }
}
