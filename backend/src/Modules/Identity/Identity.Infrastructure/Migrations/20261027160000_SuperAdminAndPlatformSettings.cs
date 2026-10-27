using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Identity.Infrastructure.Migrations;

/// <inheritdoc />
public partial class SuperAdminAndPlatformSettings : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "is_super_admin",
            table: "users",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.CreateTable(
            name: "platform_settings",
            columns: table => new
            {
                key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                value = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_by_email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_platform_settings", x => x.key);
            });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "platform_settings");

        migrationBuilder.DropColumn(
            name: "is_super_admin",
            table: "users");
    }
}

