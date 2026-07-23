using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWhatsApp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "whatsapp_connections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    phone_number_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    access_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    display_phone_number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    connected_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_whatsapp_connections", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "whatsapp_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    meta_template_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    language_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_whatsapp_templates", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_whatsapp_connections_tenant_id",
                table: "whatsapp_connections",
                column: "tenant_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_whatsapp_templates_tenant_id_type",
                table: "whatsapp_templates",
                columns: new[] { "tenant_id", "type" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "whatsapp_connections");

            migrationBuilder.DropTable(
                name: "whatsapp_templates");
        }
    }
}
