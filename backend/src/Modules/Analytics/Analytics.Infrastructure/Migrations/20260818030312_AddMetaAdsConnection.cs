using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Analytics.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMetaAdsConnection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "meta_ads_connections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    access_token_encrypted = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    token_expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ad_account_id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ad_account_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    connected_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_meta_ads_connections", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_meta_ads_connections_tenant_id",
                table: "meta_ads_connections",
                column: "tenant_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "meta_ads_connections");
        }
    }
}
