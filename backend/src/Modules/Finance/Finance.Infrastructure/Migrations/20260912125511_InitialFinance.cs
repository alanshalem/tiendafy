using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialFinance : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "account_movements",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                account_id = table.Column<Guid>(type: "uuid", nullable: false),
                occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                kind = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                amount_minor = table.Column<long>(type: "bigint", nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                concept = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                reference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                transfer_group_id = table.Column<Guid>(type: "uuid", nullable: true),
                receipt_id = table.Column<Guid>(type: "uuid", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_account_movements", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "financial_accounts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                opening_balance_minor = table.Column<long>(type: "bigint", nullable: false),
                detail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_financial_accounts", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "ledger_entries",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                party_kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                party_id = table.Column<Guid>(type: "uuid", nullable: false),
                occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                kind = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: false),
                amount_minor = table.Column<long>(type: "bigint", nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                doc_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                doc_id = table.Column<Guid>(type: "uuid", nullable: true),
                doc_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                settled_minor = table.Column<long>(type: "bigint", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_ledger_entries", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "receipts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                kind = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                party_kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                party_id = table.Column<Guid>(type: "uuid", nullable: false),
                party_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                total_minor = table.Column<long>(type: "bigint", nullable: false),
                notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                voided = table.Column<bool>(type: "boolean", nullable: false),
                voided_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                void_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_receipts", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "receipt_allocations",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                ledger_entry_id = table.Column<Guid>(type: "uuid", nullable: false),
                amount_minor = table.Column<long>(type: "bigint", nullable: false),
                receipt_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_receipt_allocations", x => x.id);
                table.ForeignKey(
                    name: "fk_receipt_allocations_receipts_receipt_id",
                    column: x => x.receipt_id,
                    principalTable: "receipts",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "receipt_payments",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                account_id = table.Column<Guid>(type: "uuid", nullable: false),
                amount_minor = table.Column<long>(type: "bigint", nullable: false),
                receipt_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_receipt_payments", x => x.id);
                table.ForeignKey(
                    name: "fk_receipt_payments_receipts_receipt_id",
                    column: x => x.receipt_id,
                    principalTable: "receipts",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_account_movements_tenant_id_account_id_occurred_at_utc",
            table: "account_movements",
            columns: new[] { "tenant_id", "account_id", "occurred_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_account_movements_tenant_id_receipt_id",
            table: "account_movements",
            columns: new[] { "tenant_id", "receipt_id" });

        migrationBuilder.CreateIndex(
            name: "ix_financial_accounts_tenant_id_active",
            table: "financial_accounts",
            columns: new[] { "tenant_id", "active" });

        migrationBuilder.CreateIndex(
            name: "ix_ledger_entries_tenant_id_doc_type_doc_id",
            table: "ledger_entries",
            columns: new[] { "tenant_id", "doc_type", "doc_id" });

        migrationBuilder.CreateIndex(
            name: "ix_ledger_entries_tenant_id_party_kind_party_id_occurred_at_utc",
            table: "ledger_entries",
            columns: new[] { "tenant_id", "party_kind", "party_id", "occurred_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_receipt_allocations_ledger_entry_id",
            table: "receipt_allocations",
            column: "ledger_entry_id");

        migrationBuilder.CreateIndex(
            name: "ix_receipt_allocations_receipt_id",
            table: "receipt_allocations",
            column: "receipt_id");

        migrationBuilder.CreateIndex(
            name: "ix_receipt_payments_receipt_id",
            table: "receipt_payments",
            column: "receipt_id");

        migrationBuilder.CreateIndex(
            name: "ix_receipts_tenant_id_kind_number",
            table: "receipts",
            columns: new[] { "tenant_id", "kind", "number" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_receipts_tenant_id_party_kind_party_id",
            table: "receipts",
            columns: new[] { "tenant_id", "party_kind", "party_id" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "account_movements");

        migrationBuilder.DropTable(
            name: "financial_accounts");

        migrationBuilder.DropTable(
            name: "ledger_entries");

        migrationBuilder.DropTable(
            name: "receipt_allocations");

        migrationBuilder.DropTable(
            name: "receipt_payments");

        migrationBuilder.DropTable(
            name: "receipts");
    }
}
