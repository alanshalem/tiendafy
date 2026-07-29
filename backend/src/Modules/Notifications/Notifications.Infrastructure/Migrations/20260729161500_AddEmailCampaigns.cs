using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailCampaigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "campaign_recipients",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_campaign_recipients", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "email_campaigns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    body_html = table.Column<string>(type: "text", nullable: false),
                    audience = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    recipient_count = table.Column<int>(type: "integer", nullable: false),
                    sent_count = table.Column<int>(type: "integer", nullable: false),
                    failed_count = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    sent_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_email_campaigns", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "email_suppressions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    reason = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_email_suppressions", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_campaign_recipients_campaign_id_email",
                table: "campaign_recipients",
                columns: new[] { "campaign_id", "email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_campaign_recipients_campaign_id_status",
                table: "campaign_recipients",
                columns: new[] { "campaign_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_email_campaigns_status",
                table: "email_campaigns",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_email_campaigns_tenant_id_created_at_utc",
                table: "email_campaigns",
                columns: new[] { "tenant_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_email_suppressions_tenant_id_email",
                table: "email_suppressions",
                columns: new[] { "tenant_id", "email" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "campaign_recipients");

            migrationBuilder.DropTable(
                name: "email_campaigns");

            migrationBuilder.DropTable(
                name: "email_suppressions");
        }
    }
}
