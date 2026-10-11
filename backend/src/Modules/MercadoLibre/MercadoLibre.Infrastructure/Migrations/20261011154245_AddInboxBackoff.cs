using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MercadoLibre.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddInboxBackoff : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_meli_notifications_status_created_at_utc",
            table: "meli_notifications");

        migrationBuilder.AddColumn<DateTime>(
            name: "next_attempt_at_utc",
            table: "meli_notifications",
            type: "timestamp with time zone",
            nullable: false,
            defaultValueSql: "now()");

        // Lo que ya estaba en la cola arranca elegible, con su propia fecha
        // de alta: un evento viejo no tiene por que esperar un backoff que
        // todavia no existia cuando fallo.
        migrationBuilder.Sql(
            "update meli_notifications set next_attempt_at_utc = created_at_utc;");

        migrationBuilder.CreateIndex(
            name: "ix_meli_notifications_status_next_attempt_at_utc",
            table: "meli_notifications",
            columns: new[] { "status", "next_attempt_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_meli_notifications_status_next_attempt_at_utc",
            table: "meli_notifications");

        migrationBuilder.DropColumn(
            name: "next_attempt_at_utc",
            table: "meli_notifications");

        migrationBuilder.CreateIndex(
            name: "ix_meli_notifications_status_created_at_utc",
            table: "meli_notifications",
            columns: new[] { "status", "created_at_utc" });
    }
}
