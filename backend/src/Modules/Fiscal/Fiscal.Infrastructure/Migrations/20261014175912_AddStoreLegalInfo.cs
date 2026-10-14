using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddStoreLegalInfo : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "store_legal_info",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                legal_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                cuit = table.Column<string>(type: "character varying(11)", maxLength: 11, nullable: true),
                address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                condition = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                vat_rate_percent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                other_national_taxes_percent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                show_price_without_taxes = table.Column<bool>(type: "boolean", nullable: false),
                data_fiscal_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                data_fiscal_image_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_store_legal_info", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_store_legal_info_tenant_id",
            table: "store_legal_info",
            column: "tenant_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "store_legal_info");
    }
}
