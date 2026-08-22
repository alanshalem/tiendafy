using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Themes.Infrastructure;

public sealed class ThemesDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public ThemesDbContext(DbContextOptions<ThemesDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<ThemeDocument> Themes => Set<ThemeDocument>();
    public DbSet<ThemeVersion> ThemeVersions => Set<ThemeVersion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var theme = modelBuilder.Entity<ThemeDocument>();
        theme.ToTable("themes");
        theme.HasKey(t => t.Id);
        theme.Property(t => t.Id).ValueGeneratedNever();
        theme.HasQueryFilter(t => !_filterByTenant || t.TenantId == _tenantGuid);
        theme.HasIndex(t => t.TenantId).IsUnique();
        theme.Property(t => t.PublishedConfig).HasColumnType("jsonb");
        theme.Property(t => t.DraftConfig).HasColumnType("jsonb");
        theme.Property(t => t.ScheduledConfig).HasColumnType("jsonb");

        var version = modelBuilder.Entity<ThemeVersion>();
        version.ToTable("theme_versions");
        version.HasKey(v => v.Id);
        version.Property(v => v.Id).ValueGeneratedNever();
        version.HasQueryFilter(v => !_filterByTenant || v.TenantId == _tenantGuid);
        version.HasIndex(v => new { v.TenantId, v.PublishedAtUtc });
        version.Property(v => v.Config).HasColumnType("jsonb");
    }
}
