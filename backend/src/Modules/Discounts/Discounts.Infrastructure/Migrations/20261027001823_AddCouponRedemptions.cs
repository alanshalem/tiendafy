using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discounts.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCouponRedemptions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "coupon_redemptions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                coupon_id = table.Column<Guid>(type: "uuid", nullable: false),
                checkout_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_coupon_redemptions", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_coupon_redemptions_coupon_id",
            table: "coupon_redemptions",
            column: "coupon_id");

        migrationBuilder.CreateIndex(
            name: "ix_coupon_redemptions_tenant_id_checkout_session_id",
            table: "coupon_redemptions",
            columns: new[] { "tenant_id", "checkout_session_id" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "coupon_redemptions");
    }
}
