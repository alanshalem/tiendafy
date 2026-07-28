using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tenancy.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialTenancy : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "tenants",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                subdomain = table.Column<string>(type: "character varying(63)", maxLength: 63, nullable: false),
                custom_domain = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                plan = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_tenants", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_tenants_custom_domain",
            table: "tenants",
            column: "custom_domain",
            unique: true,
            filter: "custom_domain IS NOT NULL");

        migrationBuilder.CreateIndex(
            name: "ix_tenants_subdomain",
            table: "tenants",
            column: "subdomain",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "tenants");
    }
}
