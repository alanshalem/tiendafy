using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Reviews.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddProductReviews : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "product_reviews",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                product_id = table.Column<Guid>(type: "uuid", nullable: false),
                variant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                rating = table.Column<int>(type: "integer", nullable: false),
                title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                author_name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                buyer_email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                product_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                variant_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                photos = table.Column<List<string>>(type: "text[]", nullable: false),
                status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                reply = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                replied_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                helpful_count = table.Column<int>(type: "integer", nullable: false),
                report_count = table.Column<int>(type: "integer", nullable: false),
                flagged = table.Column<bool>(type: "boolean", nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                moderated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_product_reviews", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "review_requests",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                order_id = table.Column<Guid>(type: "uuid", nullable: false),
                outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_review_requests", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "review_settings",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                auto_approve_min_rating = table.Column<int>(type: "integer", nullable: true),
                request_delay_days = table.Column<int>(type: "integer", nullable: false),
                show_on_store = table.Column<bool>(type: "boolean", nullable: false),
                updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_review_settings", x => x.tenant_id);
            });

        migrationBuilder.CreateTable(
            name: "review_votes",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                review_id = table.Column<Guid>(type: "uuid", nullable: false),
                kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_review_votes", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_product_reviews_tenant_id_order_item_id",
            table: "product_reviews",
            columns: new[] { "tenant_id", "order_item_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_product_reviews_tenant_id_product_id_status",
            table: "product_reviews",
            columns: new[] { "tenant_id", "product_id", "status" });

        migrationBuilder.CreateIndex(
            name: "ix_product_reviews_tenant_id_status_created_at_utc",
            table: "product_reviews",
            columns: new[] { "tenant_id", "status", "created_at_utc" });

        migrationBuilder.CreateIndex(
            name: "ix_review_requests_tenant_id_order_id",
            table: "review_requests",
            columns: new[] { "tenant_id", "order_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_review_votes_review_id_kind_fingerprint",
            table: "review_votes",
            columns: new[] { "review_id", "kind", "fingerprint" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "product_reviews");

        migrationBuilder.DropTable(
            name: "review_requests");

        migrationBuilder.DropTable(
            name: "review_settings");

        migrationBuilder.DropTable(
            name: "review_votes");
    }
}
