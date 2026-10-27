using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <summary>
/// El documento del comprador pasa a guardarse cifrado en los comprobantes
/// (<c>doc_nro</c>, que era un número) y en los jobs de emisión (<c>buyer_doc</c>):
/// el ciphertext es texto y no entra en los 20 de antes. El SOAP crudo ya era
/// <c>text</c>. Las filas viejas quedan con el número en texto y las cifra
/// BuyerPiiBackfill al arrancar la versión nueva, no este paso.
/// </summary>
public partial class EncryptBuyerDocInFiscal : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "buyer_doc",
            table: "fiscal_emission_jobs",
            type: "text",
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20,
            oldNullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "doc_nro",
            table: "fiscal_documents",
            type: "text",
            nullable: false,
            oldClrType: typeof(long),
            oldType: "bigint");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Volver atrás con datos cifrados falla (el ciphertext no es un número
        // ni entra en el varchar): antes hay que descifrarlos con la versión nueva.
        migrationBuilder.AlterColumn<string>(
            name: "buyer_doc",
            table: "fiscal_emission_jobs",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);

        migrationBuilder.AlterColumn<long>(
            name: "doc_nro",
            table: "fiscal_documents",
            type: "bigint",
            nullable: false,
            oldClrType: typeof(string),
            oldType: "text");
    }
}
