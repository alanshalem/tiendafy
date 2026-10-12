using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Identity.Infrastructure.Migrations;

/// <inheritdoc />
public partial class TeamPermissionsAndAudit : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "audit_events",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                actor_name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                summary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_audit_events", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "member_permissions",
            columns: table => new
            {
                membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                permission = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                granted = table.Column<bool>(type: "boolean", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_member_permissions", x => new { x.membership_id, x.permission });
                table.ForeignKey(
                    name: "fk_member_permissions_tenant_memberships_membership_id",
                    column: x => x.membership_id,
                    principalTable: "tenant_memberships",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "tenant_role_permissions",
            columns: table => new
            {
                tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                role = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                permission = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                granted = table.Column<bool>(type: "boolean", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_tenant_role_permissions", x => new { x.tenant_id, x.role, x.permission });
            });

        migrationBuilder.CreateIndex(
            name: "ix_audit_events_tenant_id_created_at_utc",
            table: "audit_events",
            columns: new[] { "tenant_id", "created_at_utc" });

        // "staff" era el rol de cuando había dos: operaba todo menos la
        // tienda en sí, que es exactamente lo que hoy es administrador.
        migrationBuilder.Sql("UPDATE tenant_memberships SET role = 'admin' WHERE role = 'staff';");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "audit_events");

        migrationBuilder.DropTable(
            name: "member_permissions");

        migrationBuilder.DropTable(
            name: "tenant_role_permissions");
    }
}
