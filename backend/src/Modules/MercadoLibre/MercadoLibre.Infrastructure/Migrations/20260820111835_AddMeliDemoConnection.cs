using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddMeliDemoConnection : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "is_demo",
            table: "meli_connections",
            type: "boolean",
            nullable: false,
            defaultValue: false);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "is_demo",
            table: "meli_connections");
    }
}
