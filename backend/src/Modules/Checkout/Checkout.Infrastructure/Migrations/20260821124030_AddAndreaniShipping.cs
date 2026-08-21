using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddAndreaniShipping : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "andreani_configs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                username = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                password_encrypted = table.Column<string>(type: "text", nullable: false),
                client_code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                home_delivery_contract = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                branch_pickup_contract = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                origin_branch = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                use_qa = table.Column<bool>(type: "boolean", nullable: false),
                volumetric_factor = table.Column<decimal>(type: "numeric(6,3)", nullable: false),
                sender_name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                sender_email = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                sender_document_type = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                sender_document_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                sender_phone = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: true),
                origin_street = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                origin_number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                origin_city = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                origin_postal_code = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                default_weight_grams = table.Column<int>(type: "integer", nullable: false),
                default_length_cm = table.Column<int>(type: "integer", nullable: false),
                default_width_cm = table.Column<int>(type: "integer", nullable: false),
                default_height_cm = table.Column<int>(type: "integer", nullable: false),
                active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_andreani_configs", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "andreani_shipments",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                tracking_number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                all_tracking_numbers = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                label_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                contract_used = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                branch_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                raw_status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                raw_status_id = table.Column<int>(type: "integer", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                last_tracked_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_andreani_shipments", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_andreani_configs_tenant_id",
            table: "andreani_configs",
            column: "tenant_id",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_andreani_shipments_tenant_id_order_id",
            table: "andreani_shipments",
            columns: new[] { "tenant_id", "order_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_andreani_shipments_tracking_number",
            table: "andreani_shipments",
            column: "tracking_number");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "andreani_configs");

        migrationBuilder.DropTable(
            name: "andreani_shipments");
    }
}
