using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Content.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddTrackingSettings : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "tracking_settings",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                enabled = table.Column<bool>(type: "boolean", nullable: false),
                require_consent = table.Column<bool>(type: "boolean", nullable: false),
                ga4id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                google_ads_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                meta_pixel_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                clarity_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                updated_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_tracking_settings", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_tracking_settings_tenant_id",
            table: "tracking_settings",
            column: "tenant_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "tracking_settings");
    }
}
