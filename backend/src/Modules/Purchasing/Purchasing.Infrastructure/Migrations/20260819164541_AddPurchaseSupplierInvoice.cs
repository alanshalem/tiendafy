using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Purchasing.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPurchaseSupplierInvoice : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "invoice_date_utc",
            table: "purchase_orders",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "invoice_net_ars",
            table: "purchase_orders",
            type: "numeric",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "invoice_number",
            table: "purchase_orders",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "invoice_type",
            table: "purchase_orders",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "invoice_vat_ars",
            table: "purchase_orders",
            type: "numeric",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "supplier_tax_id",
            table: "purchase_orders",
            type: "text",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "invoice_date_utc",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "invoice_net_ars",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "invoice_number",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "invoice_type",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "invoice_vat_ars",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "supplier_tax_id",
            table: "purchase_orders");
    }
}
