using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ai.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCatalogItemClaimIndex : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "ix_ai_catalog_job_items_status_claimed_at_utc",
            table: "ai_catalog_job_items",
            columns: new[] { "status", "claimed_at_utc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_ai_catalog_job_items_status_claimed_at_utc",
            table: "ai_catalog_job_items");
    }
}
