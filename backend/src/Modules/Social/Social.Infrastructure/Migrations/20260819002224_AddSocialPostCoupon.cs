using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Social.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddSocialPostCoupon : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "coupon_code",
            table: "social_posts",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "coupon_code",
            table: "social_posts");
    }
}
