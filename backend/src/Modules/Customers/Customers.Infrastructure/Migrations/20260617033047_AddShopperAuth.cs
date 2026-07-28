using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddShopperAuth : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "email_verified",
            table: "customers",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "google_subject",
            table: "customers",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "password_hash",
            table: "customers",
            type: "character varying(400)",
            maxLength: 400,
            nullable: true);

        migrationBuilder.CreateTable(
            name: "customer_favorites",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_customer_favorites", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "customer_sessions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                token = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_customer_sessions", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_customers_tenant_id_email",
            table: "customers",
            columns: new[] { "tenant_id", "email" });

        migrationBuilder.CreateIndex(
            name: "ix_customer_favorites_customer_id_product_id",
            table: "customer_favorites",
            columns: new[] { "customer_id", "product_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_customer_sessions_token",
            table: "customer_sessions",
            column: "token",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "customer_favorites");

        migrationBuilder.DropTable(
            name: "customer_sessions");

        migrationBuilder.DropIndex(
            name: "ix_customers_tenant_id_email",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "email_verified",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "google_subject",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "password_hash",
            table: "customers");
    }
}
