using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Payments.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPaymentWebhookInbox : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "payment_webhook_events",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                data_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                attempts = table.Column<int>(type: "integer", nullable: false),
                last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                processed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_payment_webhook_events", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_payment_webhook_events_status_created_at_utc",
            table: "payment_webhook_events",
            columns: new[] { "status", "created_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "payment_webhook_events");
    }
}
