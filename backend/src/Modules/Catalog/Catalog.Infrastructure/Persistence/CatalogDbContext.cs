using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class CatalogDbContext : DbContext, IUnitOfWork
{
    private readonly bool _filterByTenant;
    private readonly TenantId _currentTenant;

    public CatalogDbContext(DbContextOptions<CatalogDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _currentTenant = _filterByTenant ? tenant!.TenantId : default;
    }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<KitComponent> KitComponents => Set<KitComponent>();
    public DbSet<SpecDefinition> SpecDefinitions => Set<SpecDefinition>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CatalogDbContext).Assembly);
        // Filtro multi-tenant global (las configs viven en clases aparte sin acceso
        // al contexto, así que se agrega acá tras aplicarlas).
        modelBuilder.Entity<Product>().HasQueryFilter(p => !_filterByTenant || p.TenantId == _currentTenant);
        modelBuilder.Entity<Category>().HasQueryFilter(c => !_filterByTenant || c.TenantId == _currentTenant);

        var kit = modelBuilder.Entity<KitComponent>();
        var spec = modelBuilder.Entity<SpecDefinition>();
        spec.ToTable("spec_definitions");
        spec.HasKey(d => d.Id);
        spec.Property(d => d.Id).ValueGeneratedNever();
        spec.Property(d => d.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        spec.Property(d => d.Name).HasMaxLength(60).IsRequired();
        spec.Property(d => d.Key).HasMaxLength(80).IsRequired();
        spec.Property(d => d.Unit).HasMaxLength(12);
        spec.Property(d => d.MeliAttributeId).HasMaxLength(40);
        spec.Property(d => d.Type).HasConversion<string>().HasMaxLength(20);
        // La clave identifica al campo en filtros y links: única por tienda.
        spec.HasIndex(d => new { d.TenantId, d.Key }).IsUnique();
        spec.Property<List<string>>("_options").HasColumnName("options");
        spec.Ignore(d => d.Options);
        spec.Property<List<Guid>>("_categoryIds").HasColumnName("category_ids");
        spec.Ignore(d => d.CategoryIds);

        kit.ToTable("kit_components");
        kit.HasKey(k => k.Id);
        kit.Property(k => k.Id).ValueGeneratedNever();
        kit.HasQueryFilter(k => !_filterByTenant || k.TenantId == _currentTenant.Value);
        kit.HasIndex(k => new { k.TenantId, k.KitVariantId, k.ComponentVariantId }).IsUnique();
    }

    Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
        SaveChangesAsync(cancellationToken);
}
