using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Social.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialSocial : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "social_accounts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                provider = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                provider_id = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                username = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                avatar_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                access_token_encrypted = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: false),
                data_json = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                authorized = table.Column<bool>(type: "boolean", nullable: false),
                connected_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_social_accounts", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "social_posts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                content = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                media_urls_json = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                status = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                schedule_status = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                scheduled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                published_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_social_posts", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "social_post_targets",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                account_id = table.Column<Guid>(type: "uuid", nullable: false),
                content_override = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                provider_post_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                external_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                published_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                post_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_social_post_targets", x => x.id);
                table.ForeignKey(
                    name: "fk_social_post_targets_social_posts_post_id",
                    column: x => x.post_id,
                    principalTable: "social_posts",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_social_accounts_tenant_id_provider_provider_id",
            table: "social_accounts",
            columns: new[] { "tenant_id", "provider", "provider_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_social_post_targets_post_id",
            table: "social_post_targets",
            column: "post_id");

        migrationBuilder.CreateIndex(
            name: "ix_social_posts_status_schedule_status_scheduled_at_utc",
            table: "social_posts",
            columns: new[] { "status", "schedule_status", "scheduled_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_social_posts_tenant_id_scheduled_at_utc",
            table: "social_posts",
            columns: new[] { "tenant_id", "scheduled_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "social_accounts");

        migrationBuilder.DropTable(
            name: "social_post_targets");

        migrationBuilder.DropTable(
            name: "social_posts");
    }
}
