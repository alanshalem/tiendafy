using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Checkout.Infrastructure.Migrations;

/// <summary>
/// La sesión de checkout usa `xmin` como token de concurrencia (dos envíos
/// simultáneos de la misma compra). `xmin` es una columna de SISTEMA de
/// Postgres (existe en toda tabla): no hay DDL que ejecutar, esta migración
/// solo sincroniza el snapshot del modelo (como SyncOrdersModel en Orders).
/// </summary>
public partial class CheckoutSessionConcurrencyToken : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
