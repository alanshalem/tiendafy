using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOfflinePaymentFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "payment_due_at_utc",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payment_method_discount",
                table: "orders",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "0|ARS");

            migrationBuilder.CreateIndex(
                name: "ix_orders_status_payment_due_at_utc",
                table: "orders",
                columns: new[] { "status", "payment_due_at_utc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_orders_status_payment_due_at_utc",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "payment_due_at_utc",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "payment_method_discount",
                table: "orders");
        }
    }
}
