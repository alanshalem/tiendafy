using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fiscal.Infrastructure.Migrations;

/// <summary>
/// El nombre del servicio del ticket de acceso de ARCA pasa de 20 a 64
/// caracteres: "ws_sr_constancia_inscripcion" (el padrón nuevo) tiene 28 y el
/// ticket no se podía guardar, así que la consulta al padrón y la prueba de
/// conexión daban error.
/// </summary>
public partial class WidenAccessTokenService : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "service",
            table: "fiscal_access_tokens",
            type: "character varying(64)",
            maxLength: 64,
            nullable: false,
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "service",
            table: "fiscal_access_tokens",
            type: "character varying(20)",
            maxLength: 20,
            nullable: false,
            oldClrType: typeof(string),
            oldType: "character varying(64)",
            oldMaxLength: 64);
    }
}
