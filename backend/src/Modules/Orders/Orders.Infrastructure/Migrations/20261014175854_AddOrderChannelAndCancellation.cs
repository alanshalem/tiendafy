using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderChannelAndCancellation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "cancel_reason",
                table: "orders",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "cancelled_at_utc",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cancelled_by",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "orders",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "web");

            // Las ventas que ya existían no sabían de dónde venían: las
            // manuales se reconocen por su id de pago ("manual-…") o por la
            // nota que les pone el alta ("Venta manual (…)"), y las de un
            // presupuesto, porque esa nota sigue con "· Presupuesto N".
            migrationBuilder.Sql("""
                UPDATE orders SET channel = 'manual'
                WHERE payment_id LIKE 'manual-%' OR notes LIKE 'Venta manual (%';
                UPDATE orders SET channel = 'quote'
                WHERE notes LIKE 'Venta manual (%) · Presupuesto %';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "cancel_reason",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "cancelled_at_utc",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "cancelled_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "orders");
        }
    }
}
