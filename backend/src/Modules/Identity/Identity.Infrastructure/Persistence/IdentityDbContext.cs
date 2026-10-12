using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Persistence;

/// <summary>
/// Tablas de identidad (usuarios de plataforma). Separado del resto de
/// los módulos: nadie hace JOIN contra tablas de identity.
/// </summary>
public sealed class AppIdentityDbContext(DbContextOptions<AppIdentityDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<RolePermissionOverride> RolePermissionOverrides => Set<RolePermissionOverride>();
    public DbSet<MemberPermissionOverride> MemberPermissionOverrides => Set<MemberPermissionOverride>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        var m = builder.Entity<TenantMembership>();
        m.ToTable("tenant_memberships");
        m.HasKey(x => x.Id);
        m.Property(x => x.Id).ValueGeneratedNever();
        m.HasIndex(x => new { x.UserId, x.TenantId }).IsUnique();
        m.HasIndex(x => x.UserId);
        m.Property(x => x.Role).HasMaxLength(40).IsRequired();

        var role = builder.Entity<RolePermissionOverride>();
        role.ToTable("tenant_role_permissions");
        role.HasKey(x => new { x.TenantId, x.Role, x.Permission });
        role.Property(x => x.Role).HasMaxLength(40);
        role.Property(x => x.Permission).HasMaxLength(60);

        var member = builder.Entity<MemberPermissionOverride>();
        member.ToTable("member_permissions");
        member.HasKey(x => new { x.MembershipId, x.Permission });
        member.Property(x => x.Permission).HasMaxLength(60);
        member.HasOne<TenantMembership>().WithMany().HasForeignKey(x => x.MembershipId).OnDelete(DeleteBehavior.Cascade);

        var audit = builder.Entity<AuditEvent>();
        audit.ToTable("audit_events");
        audit.HasKey(x => x.Id);
        audit.Property(x => x.Id).ValueGeneratedNever();
        audit.Property(x => x.ActorName).HasMaxLength(256);
        audit.Property(x => x.Action).HasMaxLength(40);
        audit.Property(x => x.Summary).HasMaxLength(2000);
        audit.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });

        // Nombres de tabla sobrios en vez de AspNetXxx.
        builder.Entity<AppUser>().ToTable("users");
        builder.Entity<IdentityRole<Guid>>().ToTable("roles");
        builder.Entity<IdentityUserRole<Guid>>().ToTable("user_roles");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens");
        builder.Entity<IdentityRoleClaim<Guid>>().ToTable("role_claims");

        builder.Entity<AppUser>().Property(u => u.DisplayName).HasMaxLength(100);
    }
}
