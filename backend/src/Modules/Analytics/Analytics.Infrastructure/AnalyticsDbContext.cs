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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var pv = modelBuilder.Entity<PageView>();
        pv.ToTable("page_views");
        pv.HasKey(p => p.Id);
        pv.Property(p => p.Id).ValueGeneratedNever();
        pv.HasQueryFilter(p => !_filterByTenant || p.TenantId == _tenantGuid);
        pv.Property(p => p.Path).HasMaxLength(512);
        pv.Property(p => p.Referrer).HasMaxLength(512);
        pv.Property(p => p.VisitorId).HasMaxLength(64);
        pv.Property(p => p.SessionId).HasMaxLength(64);
        pv.HasIndex(p => new { p.TenantId, p.OccurredAtUtc });
    }
}
