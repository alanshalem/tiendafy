using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCartRecoveryFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "recovery_email_sent_at_utc",
                table: "checkout_sessions",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "recovery_email_sent_at_utc",
                table: "checkout_sessions");
        }
    }
}
