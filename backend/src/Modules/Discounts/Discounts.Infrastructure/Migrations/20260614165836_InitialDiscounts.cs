using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discounts.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialDiscounts : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "coupons",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                value = table.Column<long>(type: "bigint", nullable: false),
                min_purchase = table.Column<long>(type: "bigint", nullable: false),
                starts_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                ends_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                max_uses = table.Column<int>(type: "integer", nullable: true),
                used_count = table.Column<int>(type: "integer", nullable: false),
                active = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_coupons", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_coupons_tenant_id_code",
            table: "coupons",
            columns: new[] { "tenant_id", "code" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "coupons");
    }
}
