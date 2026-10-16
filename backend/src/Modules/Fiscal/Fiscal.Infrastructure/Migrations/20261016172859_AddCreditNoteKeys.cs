using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <summary>
/// Varias notas de crédito por venta: el job y el comprobante llevan la clave
/// del pedido que los originó (un reembolso, un pedido manual) y el único del
/// outbox pasa a ser (tienda, orden, tipo, clave). Lo que ya existía queda con
/// la clave vacía (la factura, y la NC única de antes).
/// </summary>
public partial class AddCreditNoteKeys : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_fiscal_emission_jobs_tenant_id_order_id_kind",
            table: "fiscal_emission_jobs");

        migrationBuilder.AddColumn<string>(
            name: "idempotency_key",
            table: "fiscal_emission_jobs",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "reason",
            table: "fiscal_emission_jobs",
            type: "character varying(300)",
            maxLength: 300,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "idempotency_key",
            table: "fiscal_documents",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_fiscal_emission_jobs_tenant_id_order_id_kind_idempotency_key",
            table: "fiscal_emission_jobs",
            columns: new[] { "tenant_id", "order_id", "kind", "idempotency_key" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_fiscal_emission_jobs_tenant_id_order_id_kind_idempotency_key",
            table: "fiscal_emission_jobs");

        migrationBuilder.DropColumn(
            name: "idempotency_key",
            table: "fiscal_emission_jobs");

        migrationBuilder.DropColumn(
            name: "reason",
            table: "fiscal_emission_jobs");

        migrationBuilder.DropColumn(
            name: "idempotency_key",
            table: "fiscal_documents");

        migrationBuilder.CreateIndex(
            name: "ix_fiscal_emission_jobs_tenant_id_order_id_kind",
            table: "fiscal_emission_jobs",
            columns: new[] { "tenant_id", "order_id", "kind" },
            unique: true);
    }
}
