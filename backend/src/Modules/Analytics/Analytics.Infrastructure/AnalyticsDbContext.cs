using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Analytics.Infrastructure;

public sealed class AnalyticsDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public AnalyticsDbContext(DbContextOptions<AnalyticsDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<PageView> PageViews => Set<PageView>();
    public DbSet<MetaAdsConnection> MetaAdsConnections => Set<MetaAdsConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var pv = modelBuilder.Entity<PageView>();
        pv.ToTable("page_views");
        pv.HasKey(p => p.Id);
        pv.Property(p => p.Id).ValueGeneratedNever();
        pv.HasQueryFilter(p => FilterByTenant && p.TenantId == TenantGuid);
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
        meta.HasQueryFilter(m => FilterByTenant && m.TenantId == TenantGuid);
        meta.Property(m => m.AccessTokenEncrypted).HasMaxLength(2048);
        meta.Property(m => m.AdAccountId).HasMaxLength(40);
        meta.Property(m => m.AdAccountName).HasMaxLength(200);
        meta.HasIndex(m => m.TenantId).IsUnique(); // una conexión por tienda
    }
}
