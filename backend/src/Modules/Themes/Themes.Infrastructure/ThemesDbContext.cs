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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var theme = modelBuilder.Entity<ThemeDocument>();
        theme.ToTable("themes");
        theme.HasKey(t => t.Id);
        theme.Property(t => t.Id).ValueGeneratedNever();
        theme.HasQueryFilter(t => !_filterByTenant || t.TenantId == _tenantGuid);
        theme.HasIndex(t => t.TenantId).IsUnique();
        theme.Property(t => t.Announcement).HasMaxLength(200);
        theme.Property(t => t.TokensJson).HasColumnType("jsonb");
        theme.Property(t => t.SectionsJson).HasColumnType("jsonb");
        theme.Property(t => t.PublishedConfig).HasColumnType("jsonb");
        theme.Property(t => t.DraftConfig).HasColumnType("jsonb");
    }
}
