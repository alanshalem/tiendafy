using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddNewsletterSubscribers : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "newsletter_subscribers",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_newsletter_subscribers", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_newsletter_subscribers_tenant_id_email",
            table: "newsletter_subscribers",
            columns: new[] { "tenant_id", "email" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "newsletter_subscribers");
    }
}
