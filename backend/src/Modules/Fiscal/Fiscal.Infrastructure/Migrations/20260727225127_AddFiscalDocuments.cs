using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFiscalDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fiscal_documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    environment = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    pto_vta = table.Column<int>(type: "integer", nullable: false),
                    cbte_tipo = table.Column<int>(type: "integer", nullable: false),
                    number = table.Column<long>(type: "bigint", nullable: false),
                    doc_tipo = table.Column<int>(type: "integer", nullable: false),
                    doc_nro = table.Column<long>(type: "bigint", nullable: false),
                    imp_total = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    imp_neto = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    imp_iva = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    result = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    cae = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    cae_vto_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    observations = table.Column<string>(type: "text", nullable: true),
                    errors = table.Column<string>(type: "text", nullable: true),
                    request_payload = table.Column<string>(type: "text", nullable: true),
                    response_payload = table.Column<string>(type: "text", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_documents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "fiscal_sequences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    environment = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    pto_vta = table.Column<int>(type: "integer", nullable: false),
                    cbte_tipo = table.Column<int>(type: "integer", nullable: false),
                    last_number = table.Column<long>(type: "bigint", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_fiscal_sequences", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_documents_tenant_id_environment_pto_vta_cbte_tipo_nu",
                table: "fiscal_documents",
                columns: new[] { "tenant_id", "environment", "pto_vta", "cbte_tipo", "number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_documents_tenant_id_order_id",
                table: "fiscal_documents",
                columns: new[] { "tenant_id", "order_id" });

            migrationBuilder.CreateIndex(
                name: "ix_fiscal_sequences_tenant_id_environment_pto_vta_cbte_tipo",
                table: "fiscal_sequences",
                columns: new[] { "tenant_id", "environment", "pto_vta", "cbte_tipo" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fiscal_documents");

            migrationBuilder.DropTable(
                name: "fiscal_sequences");
        }
    }
}
