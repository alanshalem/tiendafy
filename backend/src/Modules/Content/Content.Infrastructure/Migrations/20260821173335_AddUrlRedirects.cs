using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Content.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddUrlRedirects : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "url_redirects",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                from_path = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                to_path = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                hits = table.Column<int>(type: "integer", nullable: false),
                last_hit_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_url_redirects", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_url_redirects_tenant_id_from_path",
            table: "url_redirects",
            columns: new[] { "tenant_id", "from_path" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "url_redirects");
    }
}
