using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Payments.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mp_connections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    mercado_pago_user_id = table.Column<long>(type: "bigint", nullable: false),
                    access_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    refresh_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    public_key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    scope = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    token_expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    connected_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    checkout_mode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    marketplace_fee_percent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    statement_descriptor = table.Column<string>(type: "character varying(22)", maxLength: 22, nullable: true),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_mp_connections", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_mp_connections_tenant_id",
                table: "mp_connections",
                column: "tenant_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mp_connections");
        }
    }
}
