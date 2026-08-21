using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Content.Infrastructure;

public sealed class ContentDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public ContentDbContext(DbContextOptions<ContentDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<Page> Pages => Set<Page>();
    public DbSet<UrlRedirect> Redirects => Set<UrlRedirect>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var page = modelBuilder.Entity<Page>();
        page.ToTable("pages");
        page.HasKey(p => p.Id);
        page.Property(p => p.Id).ValueGeneratedNever();
        page.HasQueryFilter(p => !_filterByTenant || p.TenantId == _tenantGuid);
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
        redirect.HasQueryFilter(r => !_filterByTenant || r.TenantId == _tenantGuid);
        // La ruta vieja resuelve a un solo destino: el índice único evita que
        // dos reglas se peleen por la misma URL.
        redirect.HasIndex(r => new { r.TenantId, r.FromPath }).IsUnique();
        redirect.Property(r => r.FromPath).HasMaxLength(UrlRedirect.MaxPathLength).IsRequired();
        redirect.Property(r => r.ToPath).HasMaxLength(UrlRedirect.MaxPathLength).IsRequired();
    }
}
