using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Catalog.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddSearchSettingsAndProductUpdatedAt : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "updated_at_utc",
            table: "products",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "search_queries",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                term = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                count = table.Column<int>(type: "integer", nullable: false),
                last_results = table.Column<int>(type: "integer", nullable: false),
                last_searched_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_search_queries", x => new { x.tenant_id, x.term });
            });

        migrationBuilder.CreateTable(
            name: "search_settings",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                synonym_groups = table.Column<List<string>>(type: "text[]", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_search_settings", x => x.tenant_id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_search_queries_tenant_id_count",
            table: "search_queries",
            columns: new[] { "tenant_id", "count" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "search_queries");

        migrationBuilder.DropTable(
            name: "search_settings");

        migrationBuilder.DropColumn(
            name: "updated_at_utc",
            table: "products");
    }
}
