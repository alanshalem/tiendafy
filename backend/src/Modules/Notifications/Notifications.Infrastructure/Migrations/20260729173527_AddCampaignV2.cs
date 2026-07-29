using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCampaignV2 : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "campaign_id",
            table: "email_suppressions",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "audience_json",
            table: "email_campaigns",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "coupon_code",
            table: "email_campaigns",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "products_json",
            table: "email_campaigns",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "scheduled_at_utc",
            table: "email_campaigns",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "clicked_at_utc",
            table: "campaign_recipients",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "opened_at_utc",
            table: "campaign_recipients",
            type: "timestamp with time zone",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "campaign_id",
            table: "email_suppressions");

        migrationBuilder.DropColumn(
            name: "audience_json",
            table: "email_campaigns");

        migrationBuilder.DropColumn(
            name: "coupon_code",
            table: "email_campaigns");

        migrationBuilder.DropColumn(
            name: "products_json",
            table: "email_campaigns");

        migrationBuilder.DropColumn(
            name: "scheduled_at_utc",
            table: "email_campaigns");

        migrationBuilder.DropColumn(
            name: "clicked_at_utc",
            table: "campaign_recipients");

        migrationBuilder.DropColumn(
            name: "opened_at_utc",
            table: "campaign_recipients");
    }
}
