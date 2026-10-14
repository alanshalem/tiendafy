using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCustomerAddresses : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "customer_addresses",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                label = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                name = table.Column<string>(type: "text", nullable: false),
                last_name = table.Column<string>(type: "text", nullable: true),
                phone = table.Column<string>(type: "text", nullable: true),
                doc_number = table.Column<string>(type: "text", nullable: true),
                street = table.Column<string>(type: "text", nullable: false),
                street_number = table.Column<string>(type: "text", nullable: false),
                apartment = table.Column<string>(type: "text", nullable: true),
                city = table.Column<string>(type: "text", nullable: false),
                province = table.Column<string>(type: "text", nullable: true),
                postal_code = table.Column<string>(type: "text", nullable: false),
                is_default = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_customer_addresses", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_customer_addresses_tenant_id_customer_id",
            table: "customer_addresses",
            columns: new[] { "tenant_id", "customer_id" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "customer_addresses");
    }
}
