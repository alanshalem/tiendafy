using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFiscalEmissionJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fiscal_emission_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<int>(type: "integer", nullable: false),
                    gross_minor_units = table.Column<long>(type: "bigint", nullable: false),
                    buyer_doc = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    status = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    next_attempt_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    fiscal_document_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_emission_jobs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_emission_jobs_status_next_attempt_utc",
                table: "fiscal_emission_jobs",
                columns: new[] { "status", "next_attempt_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_emission_jobs_tenant_id_order_id_kind",
                table: "fiscal_emission_jobs",
                columns: new[] { "tenant_id", "order_id", "kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fiscal_emission_jobs");
        }
    }
}
