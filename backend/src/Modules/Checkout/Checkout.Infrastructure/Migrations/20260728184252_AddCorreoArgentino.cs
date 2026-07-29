using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCorreoArgentino : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "correo_argentino_configs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                user_token_encrypted = table.Column<string>(type: "text", nullable: false),
                password_token_encrypted = table.Column<string>(type: "text", nullable: false),
                environment = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                origin_postal_code = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                default_weight_grams = table.Column<int>(type: "integer", nullable: false),
                default_length_cm = table.Column<int>(type: "integer", nullable: false),
                default_width_cm = table.Column<int>(type: "integer", nullable: false),
                default_height_cm = table.Column<int>(type: "integer", nullable: false),
                offer_home_delivery = table.Column<bool>(type: "boolean", nullable: false),
                offer_agency_delivery = table.Column<bool>(type: "boolean", nullable: false),
                active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_correo_argentino_configs", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_correo_argentino_configs_tenant_id",
            table: "correo_argentino_configs",
            column: "tenant_id",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "correo_argentino_configs");
    }
}
