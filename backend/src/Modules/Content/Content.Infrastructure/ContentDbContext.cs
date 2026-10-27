using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Content.Infrastructure;

public sealed class ContentDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public ContentDbContext(DbContextOptions<ContentDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<Page> Pages => Set<Page>();
    public DbSet<UrlRedirect> Redirects => Set<UrlRedirect>();
    public DbSet<TrackingSettings> Tracking => Set<TrackingSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var page = modelBuilder.Entity<Page>();
        page.ToTable("pages");
        page.HasKey(p => p.Id);
        page.Property(p => p.Id).ValueGeneratedNever();
        page.HasQueryFilter(p => FilterByTenant && p.TenantId == TenantGuid);
        page.HasIndex(p => new { p.TenantId, p.Slug }).IsUnique();
        page.Property(p => p.Title).HasMaxLength(120).IsRequired();
        page.Property(p => p.Slug).HasMaxLength(120).IsRequired();
        page.Property(p => p.Body).HasColumnType("text");
        page.Property(p => p.Published);
        page.Property(p => p.CreatedAtUtc);
        page.Property(p => p.UpdatedAtUtc);

        var redirect = modelBuilder.Entity<UrlRedirect>();
        redirect.ToTable("url_redirects");
        redirect.HasKey(r => r.Id);
        redirect.Property(r => r.Id).ValueGeneratedNever();
        redirect.HasQueryFilter(r => FilterByTenant && r.TenantId == TenantGuid);
        // La ruta vieja resuelve a un solo destino: el índice único evita que
        // dos reglas se peleen por la misma URL.
        redirect.HasIndex(r => new { r.TenantId, r.FromPath }).IsUnique();
        redirect.Property(r => r.FromPath).HasMaxLength(UrlRedirect.MaxPathLength).IsRequired();
        redirect.Property(r => r.ToPath).HasMaxLength(UrlRedirect.MaxPathLength).IsRequired();

        var tracking = modelBuilder.Entity<TrackingSettings>();
        tracking.ToTable("tracking_settings");
        tracking.HasKey(t => t.Id);
        tracking.Property(t => t.Id).ValueGeneratedNever();
        tracking.HasQueryFilter(t => FilterByTenant && t.TenantId == TenantGuid);
        tracking.HasIndex(t => t.TenantId).IsUnique();
        // 40 alcanza de sobra para cualquier identificador y es un tope más:
        // lo que entra acá ya pasó por una lista blanca de caracteres.
        tracking.Property(t => t.Ga4Id).HasMaxLength(40);
        tracking.Property(t => t.GoogleAdsId).HasMaxLength(40);
        tracking.Property(t => t.MetaPixelId).HasMaxLength(40);
        tracking.Property(t => t.ClarityId).HasMaxLength(40);
    }
}
