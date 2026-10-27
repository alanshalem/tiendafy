using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <summary>
/// Doble confirmación del newsletter: la suscripción queda pendiente hasta
/// que se toca el link del mail. Las que ya había se dan por confirmadas
/// (con la fecha del alta): siguen recibiendo las campañas como hasta ahora.
/// </summary>
public partial class NewsletterDoubleOptIn : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "confirm_token_expires_at_utc",
            table: "newsletter_subscribers",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "confirm_token_hash",
            table: "newsletter_subscribers",
            type: "character varying(120)",
            maxLength: 120,
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "confirmed_at_utc",
            table: "newsletter_subscribers",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.Sql("UPDATE newsletter_subscribers SET confirmed_at_utc = created_at_utc WHERE confirmed_at_utc IS NULL;");

        migrationBuilder.CreateIndex(
            name: "ix_newsletter_subscribers_confirm_token_hash",
            table: "newsletter_subscribers",
            column: "confirm_token_hash",
            unique: true,
            filter: "confirm_token_hash IS NOT NULL");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_newsletter_subscribers_confirm_token_hash",
            table: "newsletter_subscribers");

        migrationBuilder.DropColumn(
            name: "confirm_token_expires_at_utc",
            table: "newsletter_subscribers");

        migrationBuilder.DropColumn(
            name: "confirm_token_hash",
            table: "newsletter_subscribers");

        migrationBuilder.DropColumn(
            name: "confirmed_at_utc",
            table: "newsletter_subscribers");
    }
}
