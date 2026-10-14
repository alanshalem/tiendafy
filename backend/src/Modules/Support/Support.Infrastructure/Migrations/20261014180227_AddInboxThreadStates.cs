using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Support.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInboxThreadStates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "inbox_replies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    channel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    external_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    author_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    author_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inbox_replies", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "inbox_thread_states",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    channel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    external_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    assigned_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assigned_user_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    assigned_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    archived_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    read_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    marked_unread = table.Column<bool>(type: "boolean", nullable: false),
                    last_seen_activity_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    external_unread = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inbox_thread_states", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inbox_replies_tenant_id_channel_external_id_created_at_utc",
                table: "inbox_replies",
                columns: new[] { "tenant_id", "channel", "external_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_inbox_thread_states_tenant_id_assigned_user_id",
                table: "inbox_thread_states",
                columns: new[] { "tenant_id", "assigned_user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_inbox_thread_states_tenant_id_channel_external_id",
                table: "inbox_thread_states",
                columns: new[] { "tenant_id", "channel", "external_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbox_replies");

            migrationBuilder.DropTable(
                name: "inbox_thread_states");
        }
    }
}
