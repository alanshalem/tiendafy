using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Analytics.Infrastructure.Migrations;

/// <inheritdoc />
public partial class InitialAnalytics : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "page_views",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                referrer = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                visitor_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                session_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_page_views", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_page_views_tenant_id_occurred_at_utc",
            table: "page_views",
            columns: new[] { "tenant_id", "occurred_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "page_views");
    }
}
