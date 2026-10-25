using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ai.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialAi : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "ai_catalog_job_items",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                job_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                proposal_json = table.Column<string>(type: "jsonb", nullable: true),
                judge_score = table.Column<int>(type: "integer", nullable: true),
                judge_notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                attempts = table.Column<int>(type: "integer", nullable: false),
                claimed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_catalog_job_items", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "ai_catalog_jobs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                created_by = table.Column<Guid>(type: "uuid", nullable: false),
                status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                total = table.Column<int>(type: "integer", nullable: false),
                processed = table.Column<int>(type: "integer", nullable: false),
                estimated_cost_micro_usd = table.Column<long>(type: "bigint", nullable: false),
                actual_cost_micro_usd = table.Column<long>(type: "bigint", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_catalog_jobs", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "ai_provider_credentials",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                key_encrypted = table.Column<string>(type: "text", nullable: false),
                last4 = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                last_test_ok = table.Column<bool>(type: "boolean", nullable: true),
                last_test_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_provider_credentials", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "ai_settings",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                enabled = table.Column<bool>(type: "boolean", nullable: false),
                monthly_budget_micro_usd = table.Column<long>(type: "bigint", nullable: false),
                alert_threshold_pct = table.Column<int>(type: "integer", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_settings", x => x.tenant_id);
            });

        migrationBuilder.CreateTable(
            name: "ai_task_assignments",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                task = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                primary_model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                fallback_model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_task_assignments", x => new { x.tenant_id, x.task });
            });

        migrationBuilder.CreateTable(
            name: "ai_usage",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                user_id = table.Column<Guid>(type: "uuid", nullable: true),
                task = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                run_id = table.Column<Guid>(type: "uuid", nullable: false),
                input_tokens = table.Column<long>(type: "bigint", nullable: false),
                cached_input_tokens = table.Column<long>(type: "bigint", nullable: false),
                output_tokens = table.Column<long>(type: "bigint", nullable: false),
                cost_micro_usd = table.Column<long>(type: "bigint", nullable: false),
                outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ai_usage", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_ai_catalog_job_items_job_id_status",
            table: "ai_catalog_job_items",
            columns: new[] { "job_id", "status" });

        migrationBuilder.CreateIndex(
            name: "ix_ai_catalog_jobs_tenant_id_status",
            table: "ai_catalog_jobs",
            columns: new[] { "tenant_id", "status" });

        migrationBuilder.CreateIndex(
            name: "ix_ai_provider_credentials_tenant_id_provider",
            table: "ai_provider_credentials",
            columns: new[] { "tenant_id", "provider" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_ai_usage_tenant_id_created_at_utc",
            table: "ai_usage",
            columns: new[] { "tenant_id", "created_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "ai_catalog_job_items");

        migrationBuilder.DropTable(
            name: "ai_catalog_jobs");

        migrationBuilder.DropTable(
            name: "ai_provider_credentials");

        migrationBuilder.DropTable(
            name: "ai_settings");

        migrationBuilder.DropTable(
            name: "ai_task_assignments");

        migrationBuilder.DropTable(
            name: "ai_usage");
    }
}
