using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tenancy.Infrastructure.Migrations;

/// <inheritdoc />
public partial class RemoveTenantPlan : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "plan",
            table: "tenants");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "plan",
            table: "tenants",
            type: "character varying(20)",
            maxLength: 20,
            nullable: false,
            defaultValue: "");
    }
}
