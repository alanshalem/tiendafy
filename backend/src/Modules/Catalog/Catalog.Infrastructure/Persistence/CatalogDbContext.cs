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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CatalogDbContext).Assembly);
        // Filtro multi-tenant global (las configs viven en clases aparte sin acceso
        // al contexto, así que se agrega acá tras aplicarlas).
        modelBuilder.Entity<Product>().HasQueryFilter(p => !_filterByTenant || p.TenantId == _currentTenant);
        modelBuilder.Entity<Category>().HasQueryFilter(c => !_filterByTenant || c.TenantId == _currentTenant);

        var kit = modelBuilder.Entity<KitComponent>();
        kit.ToTable("kit_components");
        kit.HasKey(k => k.Id);
        kit.Property(k => k.Id).ValueGeneratedNever();
        kit.HasQueryFilter(k => !_filterByTenant || k.TenantId == _currentTenant.Value);
        kit.HasIndex(k => new { k.TenantId, k.KitVariantId, k.ComponentVariantId }).IsUnique();
    }

    Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
        SaveChangesAsync(cancellationToken);
}
