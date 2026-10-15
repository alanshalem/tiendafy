using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <summary>
/// Cuándo salió el email "factura" de cada comprobante: lo reclama quien lo
/// manda, así el comprador recibe uno solo aunque la factura la terminen dos
/// caminos.
/// </summary>
public partial class AddBuyerNotifiedAtToFiscalDocuments : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<System.DateTime>(
            name: "buyer_notified_at_utc",
            table: "fiscal_documents",
            type: "timestamp with time zone",
            nullable: true);

        // Lo ya autorizado se da por avisado: el email es para las facturas
        // que obtienen su CAE de acá en adelante, no para mandar las viejas
        // de golpe cuando un job antiguo se reintente.
        migrationBuilder.Sql("""
            UPDATE fiscal_documents
            SET buyer_notified_at_utc = updated_at_utc
            WHERE result = 'Authorized';
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "buyer_notified_at_utc",
            table: "fiscal_documents");
    }
}
