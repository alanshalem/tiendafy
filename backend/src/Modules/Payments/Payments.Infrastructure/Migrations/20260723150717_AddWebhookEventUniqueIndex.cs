using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Payments.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddWebhookEventUniqueIndex : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "ix_payment_webhook_events_type_data_id",
            table: "payment_webhook_events",
            columns: new[] { "type", "data_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_payment_webhook_events_type_data_id",
            table: "payment_webhook_events");
    }
}
