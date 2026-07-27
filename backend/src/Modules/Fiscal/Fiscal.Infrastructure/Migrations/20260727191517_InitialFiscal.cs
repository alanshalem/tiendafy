using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialFiscal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fiscal_access_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cuit = table.Column<string>(type: "character varying(11)", maxLength: 11, nullable: false),
                    service = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    environment = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    token_encrypted = table.Column<string>(type: "text", nullable: false),
                    sign_encrypted = table.Column<string>(type: "text", nullable: false),
                    generation_time_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expiration_time_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_access_tokens", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "fiscal_certificates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    environment = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    private_key_encrypted = table.Column<string>(type: "text", nullable: false),
                    csr_pem = table.Column<string>(type: "text", nullable: true),
                    certificate_pem_encrypted = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    subject_cn = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    not_before_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    not_after_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_certificates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "fiscal_configs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cuit = table.Column<string>(type: "character varying(11)", maxLength: 11, nullable: false),
                    business_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    condition = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    environment = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    auto_invoice_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    trigger = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    default_point_of_sale_id = table.Column<Guid>(type: "uuid", nullable: true),
                    consumer_final_threshold_minor_units = table.Column<long>(type: "bigint", nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_configs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "fiscal_points_of_sale",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_points_of_sale", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_access_tokens_tenant_id_cuit_service_environment",
                table: "fiscal_access_tokens",
                columns: new[] { "tenant_id", "cuit", "service", "environment" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_certificates_tenant_id_environment",
                table: "fiscal_certificates",
                columns: new[] { "tenant_id", "environment" });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_configs_tenant_id",
                table: "fiscal_configs",
                column: "tenant_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_points_of_sale_tenant_id_number",
                table: "fiscal_points_of_sale",
                columns: new[] { "tenant_id", "number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fiscal_access_tokens");

            migrationBuilder.DropTable(
                name: "fiscal_certificates");

            migrationBuilder.DropTable(
                name: "fiscal_configs");

            migrationBuilder.DropTable(
                name: "fiscal_points_of_sale");
        }
    }
}
