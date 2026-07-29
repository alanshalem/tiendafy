using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddNotificationEvents : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "notification_events",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                channel = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                template = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_notification_events", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_notification_events_tenant_id_channel_created_at_utc",
            table: "notification_events",
            columns: new[] { "tenant_id", "channel", "created_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "notification_events");
    }
}
