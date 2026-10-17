using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <summary>
/// El permiso del checkout pasa a ser solo para WhatsApp (el email de carrito
/// abandonado no lo pide: lleva el link de baja), y la sesión anota lo último
/// que hizo el comprador, desde donde se cuenta el recordatorio. Las sesiones
/// que ya existen arrancan con su fecha de creación, que es lo que se usaba.
/// </summary>
public partial class WhatsAppConsentAndLastActivity : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.RenameColumn(
            name: "accepts_marketing",
            table: "checkout_sessions",
            newName: "accepts_whats_app");

        migrationBuilder.AddColumn<DateTime>(
            name: "last_activity_at_utc",
            table: "checkout_sessions",
            type: "timestamp with time zone",
            nullable: false,
            defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

        migrationBuilder.Sql("UPDATE checkout_sessions SET last_activity_at_utc = created_at_utc;");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "last_activity_at_utc",
            table: "checkout_sessions");

        migrationBuilder.RenameColumn(
            name: "accepts_whats_app",
            table: "checkout_sessions",
            newName: "accepts_marketing");
    }
}
