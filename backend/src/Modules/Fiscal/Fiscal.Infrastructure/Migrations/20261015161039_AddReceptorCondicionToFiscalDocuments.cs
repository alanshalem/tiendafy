using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <summary>
/// La condición frente al IVA del receptor con la que salió cada comprobante.
/// La nota de crédito la copia de la factura: recalcularla desde la venta
/// perdía la condición declarada por el comercio o el padrón.
/// </summary>
public partial class AddReceptorCondicionToFiscalDocuments : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "receptor_condicion",
            table: "fiscal_documents",
            type: "integer",
            nullable: true);

        // Los que ya existen: el pedido de CAE guardado tiene la condición que
        // viajó a ARCA (<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>).
        // Los que no lo tienen (reconciliados) quedan null y la toman de la clase.
        migrationBuilder.Sql("""
            UPDATE fiscal_documents
            SET receptor_condicion = (regexp_match(request_payload, 'CondicionIVAReceptorId>(\d+)<'))[1]::int
            WHERE receptor_condicion IS NULL
              AND request_payload ~ 'CondicionIVAReceptorId>\d+<';
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "receptor_condicion",
            table: "fiscal_documents");
    }
}
