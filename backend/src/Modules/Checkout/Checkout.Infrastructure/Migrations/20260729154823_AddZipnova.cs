using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddZipnova : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "zipnova_configs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    api_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    api_secret_encrypted = table.Column<string>(type: "text", nullable: false),
                    country = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    account_id = table.Column<int>(type: "integer", nullable: false),
                    origin_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
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
                    table.PrimaryKey("pk_zipnova_configs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "zipnova_shipments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shipment_id = table.Column<long>(type: "bigint", nullable: false),
                    carrier_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    carrier_tracking_id = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    tracking_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_zipnova_shipments", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_zipnova_configs_tenant_id",
                table: "zipnova_configs",
                column: "tenant_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_zipnova_shipments_tenant_id_order_id",
                table: "zipnova_shipments",
                columns: new[] { "tenant_id", "order_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "zipnova_configs");

            migrationBuilder.DropTable(
                name: "zipnova_shipments");
        }
    }
}
