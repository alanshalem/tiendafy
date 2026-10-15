using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddShipmentClaimsAndCorreoShipments : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "correo_shipments",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                delivery_type = table.Column<string>(type: "character varying(1)", maxLength: 1, nullable: false),
                agency = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                remote_created_at = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_correo_shipments", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "shipment_claims",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                carrier = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                claimed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_shipment_claims", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_correo_shipments_tenant_id_order_id",
            table: "correo_shipments",
            columns: new[] { "tenant_id", "order_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_shipment_claims_tenant_id_order_id_carrier",
            table: "shipment_claims",
            columns: new[] { "tenant_id", "order_id", "carrier" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "correo_shipments");

        migrationBuilder.DropTable(
            name: "shipment_claims");
    }
}
