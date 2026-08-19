using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Analytics.Infrastructure;

public sealed class AnalyticsDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public AnalyticsDbContext(DbContextOptions<AnalyticsDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<PageView> PageViews => Set<PageView>();
    public DbSet<MetaAdsConnection> MetaAdsConnections => Set<MetaAdsConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var pv = modelBuilder.Entity<PageView>();
        pv.ToTable("page_views");
        pv.HasKey(p => p.Id);
        pv.Property(p => p.Id).ValueGeneratedNever();
        pv.HasQueryFilter(p => !_filterByTenant || p.TenantId == _tenantGuid);
        pv.Property(p => p.Path).HasMaxLength(512);
        pv.Property(p => p.Referrer).HasMaxLength(512);
        pv.Property(p => p.UtmSource).HasMaxLength(40);
        pv.Property(p => p.VisitorId).HasMaxLength(64);
        pv.Property(p => p.SessionId).HasMaxLength(64);
        pv.HasIndex(p => new { p.TenantId, p.OccurredAtUtc });

        var meta = modelBuilder.Entity<MetaAdsConnection>();
        meta.ToTable("meta_ads_connections");
        meta.HasKey(m => m.Id);
        meta.Property(m => m.Id).ValueGeneratedNever();
        meta.HasQueryFilter(m => !_filterByTenant || m.TenantId == _tenantGuid);
        meta.Property(m => m.AccessTokenEncrypted).HasMaxLength(2048);
        meta.Property(m => m.AdAccountId).HasMaxLength(40);
        meta.Property(m => m.AdAccountName).HasMaxLength(200);
        meta.HasIndex(m => m.TenantId).IsUnique(); // una conexión por tienda
    }
}
