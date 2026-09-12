using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Purchasing.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddSuppliers : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "supplier_id",
            table: "purchase_orders",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "suppliers",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                tax_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                phone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                address = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                country = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_suppliers", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_purchase_orders_tenant_id_supplier_id",
            table: "purchase_orders",
            columns: new[] { "tenant_id", "supplier_id" });

        migrationBuilder.CreateIndex(
            name: "ix_suppliers_tenant_id_name",
            table: "suppliers",
            columns: new[] { "tenant_id", "name" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "suppliers");

        migrationBuilder.DropIndex(
            name: "ix_purchase_orders_tenant_id_supplier_id",
            table: "purchase_orders");

        migrationBuilder.DropColumn(
            name: "supplier_id",
            table: "purchase_orders");
    }
}
