using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <inheritdoc />
public partial class ContactMessageKind : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "kind",
            table: "contact_messages",
            type: "character varying(20)",
            maxLength: 20,
            nullable: false,
            defaultValue: "contact");

        migrationBuilder.AddColumn<string>(
            name: "order_ref",
            table: "contact_messages",
            type: "character varying(60)",
            maxLength: 60,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "reference",
            table: "contact_messages",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "kind",
            table: "contact_messages");

        migrationBuilder.DropColumn(
            name: "order_ref",
            table: "contact_messages");

        migrationBuilder.DropColumn(
            name: "reference",
            table: "contact_messages");
    }
}
