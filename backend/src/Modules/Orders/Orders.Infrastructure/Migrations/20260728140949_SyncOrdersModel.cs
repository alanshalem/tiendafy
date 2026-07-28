using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Orders.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SyncOrdersModel : Migration
    {
        // Drift detectado por los tests de integración: el modelo usa `xmin` como
        // token de concurrencia y el snapshot no lo registraba. `xmin` es una
        // columna de SISTEMA de Postgres (existe en toda tabla): no hay DDL que
        // ejecutar — esta migración solo sincroniza el snapshot del modelo.
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
