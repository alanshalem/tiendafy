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
    public DbSet<PriceList> PriceLists => Set<PriceList>();
    public DbSet<PriceListItem> PriceListItems => Set<PriceListItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Búsqueda sin tildes (ver ProductTextSearch). La extensión es de la base
        // entera; la declara el catálogo porque es quien la usa.
        modelBuilder.HasPostgresExtension("unaccent");

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
        spec.HasQueryFilter(d => !_filterByTenant || d.TenantId == _currentTenant);
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

        var priceList = modelBuilder.Entity<PriceList>();
        priceList.ToTable("price_lists");
        priceList.HasKey(l => l.Id);
        priceList.Property(l => l.Id).ValueGeneratedNever();
        priceList.HasQueryFilter(l => !_filterByTenant || l.TenantId == _currentTenant);
        priceList.Property(l => l.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        priceList.Property(l => l.Name).HasMaxLength(60).IsRequired();
        priceList.Property(l => l.Currency).HasMaxLength(3).IsRequired();
        priceList.Property(l => l.Rounding).HasMaxLength(10).IsRequired();
        priceList.Property(l => l.Notes).HasMaxLength(300);
        // El ajuste se guarda con dos decimales: "12,5%" es un caso real y
        // redondearlo a 13 mueve todos los precios de la lista.
        priceList.Property(l => l.AdjustmentPercent).HasPrecision(8, 2);
        priceList.HasIndex(l => new { l.TenantId, l.Active });

        var priceItem = modelBuilder.Entity<PriceListItem>();
        priceItem.ToTable("price_list_items");
        priceItem.HasKey(i => i.Id);
        priceItem.Property(i => i.Id).ValueGeneratedNever();
        priceItem.HasQueryFilter(i => !_filterByTenant || i.TenantId == _currentTenant);
        priceItem.Property(i => i.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        // Un precio a mano por variante y lista: sin esto, dos guardados
        // simultáneos dejan dos filas y gana la que devuelva primero la base.
        priceItem.HasIndex(i => new { i.PriceListId, i.VariantId }).IsUnique();
    }

    Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
        SaveChangesAsync(cancellationToken);
}
