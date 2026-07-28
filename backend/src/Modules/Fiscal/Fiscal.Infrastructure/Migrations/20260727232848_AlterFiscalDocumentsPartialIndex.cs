using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AlterFiscalDocumentsPartialIndex : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_fiscal_documents_tenant_id_environment_pto_vta_cbte_tipo_nu",
            table: "fiscal_documents");

        migrationBuilder.CreateIndex(
            name: "ix_fiscal_documents_tenant_id_environment_pto_vta_cbte_tipo_nu",
            table: "fiscal_documents",
            columns: new[] { "tenant_id", "environment", "pto_vta", "cbte_tipo", "number" },
            unique: true,
            filter: "result = 'Authorized'");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_fiscal_documents_tenant_id_environment_pto_vta_cbte_tipo_nu",
            table: "fiscal_documents");

        migrationBuilder.CreateIndex(
            name: "ix_fiscal_documents_tenant_id_environment_pto_vta_cbte_tipo_nu",
            table: "fiscal_documents",
            columns: new[] { "tenant_id", "environment", "pto_vta", "cbte_tipo", "number" },
            unique: true);
    }
}
