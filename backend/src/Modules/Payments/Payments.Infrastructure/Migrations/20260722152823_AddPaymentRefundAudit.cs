using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Payments.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPaymentRefundAudit : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "payment_refunds",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                payment_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                mercado_pago_refund_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                amount_in_minor_units = table.Column<long>(type: "bigint", nullable: false),
                currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                is_total = table.Column<bool>(type: "boolean", nullable: false),
                reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                requested_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_payment_refunds", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_payment_refunds_tenant_id_order_id",
            table: "payment_refunds",
            columns: new[] { "tenant_id", "order_id" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "payment_refunds");
    }
}
