using Microsoft.EntityFrameworkCore;

namespace Analytics.Infrastructure;

public sealed class AnalyticsDbContext(DbContextOptions<AnalyticsDbContext> options) : DbContext(options)
{
    public DbSet<PageView> PageViews => Set<PageView>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var pv = modelBuilder.Entity<PageView>();
        pv.ToTable("page_views");
        pv.HasKey(p => p.Id);
        pv.Property(p => p.Id).ValueGeneratedNever();
        pv.Property(p => p.Path).HasMaxLength(512);
        pv.Property(p => p.Referrer).HasMaxLength(512);
        pv.Property(p => p.VisitorId).HasMaxLength(64);
        pv.Property(p => p.SessionId).HasMaxLength(64);
        pv.HasIndex(p => new { p.TenantId, p.OccurredAtUtc });
    }
}
