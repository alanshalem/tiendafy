using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Support.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialSupport : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "support_conversations",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                unread_for_customer = table.Column<int>(type: "integer", nullable: false),
                unread_for_staff = table.Column<int>(type: "integer", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                last_message_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_support_conversations", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "support_messages",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                conversation_id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                is_from_staff = table.Column<bool>(type: "boolean", nullable: false),
                author_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                attachment_key = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                attachment_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                attachment_content_type = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_support_messages", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_support_conversations_tenant_id_customer_id",
            table: "support_conversations",
            columns: new[] { "tenant_id", "customer_id" });

        migrationBuilder.CreateIndex(
            name: "ix_support_conversations_tenant_id_last_message_at_utc",
            table: "support_conversations",
            columns: new[] { "tenant_id", "last_message_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_support_conversations_tenant_id_order_id",
            table: "support_conversations",
            columns: new[] { "tenant_id", "order_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_support_messages_conversation_id_created_at_utc",
            table: "support_messages",
            columns: new[] { "conversation_id", "created_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "support_conversations");

        migrationBuilder.DropTable(
            name: "support_messages");
    }
}
