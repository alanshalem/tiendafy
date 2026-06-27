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
