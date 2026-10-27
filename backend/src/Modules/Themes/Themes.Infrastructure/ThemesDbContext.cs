using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Themes.Infrastructure;

public sealed class ThemesDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public ThemesDbContext(DbContextOptions<ThemesDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<ThemeDocument> Themes => Set<ThemeDocument>();
    public DbSet<ThemeVersion> ThemeVersions => Set<ThemeVersion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var theme = modelBuilder.Entity<ThemeDocument>();
        theme.ToTable("themes");
        theme.HasKey(t => t.Id);
        theme.Property(t => t.Id).ValueGeneratedNever();
        theme.HasQueryFilter(t => FilterByTenant && t.TenantId == TenantGuid);
        theme.HasIndex(t => t.TenantId).IsUnique();
        theme.Property(t => t.PublishedConfig).HasColumnType("jsonb");
        theme.Property(t => t.DraftConfig).HasColumnType("jsonb");
        theme.Property(t => t.ScheduledConfig).HasColumnType("jsonb");
        // Dos guardados que leyeron la misma versión no pueden pasar los dos:
        // el UPDATE lleva "where draft_version = la leída".
        theme.Property(t => t.DraftVersion).IsConcurrencyToken();

        var version = modelBuilder.Entity<ThemeVersion>();
        version.ToTable("theme_versions");
        version.HasKey(v => v.Id);
        version.Property(v => v.Id).ValueGeneratedNever();
        version.HasQueryFilter(v => FilterByTenant && v.TenantId == TenantGuid);
        version.HasIndex(v => new { v.TenantId, v.PublishedAtUtc });
        version.Property(v => v.Config).HasColumnType("jsonb");
    }
}
