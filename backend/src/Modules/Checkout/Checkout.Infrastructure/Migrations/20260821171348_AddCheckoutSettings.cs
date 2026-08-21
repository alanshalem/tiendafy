using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCheckoutSettings : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "checkout_settings",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                single_column = table.Column<bool>(type: "boolean", nullable: false),
                require_phone = table.Column<bool>(type: "boolean", nullable: false),
                require_document = table.Column<bool>(type: "boolean", nullable: false),
                customer_note_enabled = table.Column<bool>(type: "boolean", nullable: false),
                customer_note_label = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                order_message_enabled = table.Column<bool>(type: "boolean", nullable: false),
                order_message_text = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_checkout_settings", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_checkout_settings_tenant_id",
            table: "checkout_settings",
            column: "tenant_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "checkout_settings");
    }
}
