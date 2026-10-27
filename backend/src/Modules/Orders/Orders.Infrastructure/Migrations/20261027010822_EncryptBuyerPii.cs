using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations;

/// <inheritdoc />
public partial class EncryptBuyerPii : Migration
{
    // Teléfono, documento y dirección del comprador pasan a guardarse
    // cifrados (ver PiiColumns): el ciphertext no entra en los varchar de
    // antes. Las filas viejas las cifra BuyerPiiBackfill después de migrar.
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "shipping_address",
            table: "orders",
            type: "text",
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(300)",
            oldMaxLength: 300,
            oldNullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "doc_number",
            table: "orders",
            type: "text",
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20,
            oldNullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "buyer_phone",
            table: "orders",
            type: "text",
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(40)",
            oldMaxLength: 40,
            oldNullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Volver atrás con datos cifrados falla (el ciphertext no entra en
        // el varchar): antes hay que descifrarlos con la versión nueva.
        migrationBuilder.AlterColumn<string>(
            name: "shipping_address",
            table: "orders",
            type: "character varying(300)",
            maxLength: 300,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "doc_number",
            table: "orders",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "buyer_phone",
            table: "orders",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);
    }
}
