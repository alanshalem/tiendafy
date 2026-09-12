using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Purchasing.Infrastructure;

public sealed class PurchasingDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public PurchasingDbContext(DbContextOptions<PurchasingDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var po = modelBuilder.Entity<PurchaseOrder>();
        po.ToTable("purchase_orders");
        po.HasKey(p => p.Id);
        po.Property(p => p.Id).ValueGeneratedNever();
        po.HasQueryFilter(p => !_filterByTenant || p.TenantId == _tenantGuid);
        po.Property(p => p.SupplierName).HasMaxLength(120).IsRequired();
        po.Property(p => p.Reference).HasMaxLength(120);
        po.Property(p => p.Notes).HasMaxLength(1000);
        po.Property(p => p.Currency).HasMaxLength(3);
        po.Property(p => p.ExchangeRate).HasPrecision(18, 4);
        po.Property(p => p.Status).HasConversion<string>().HasMaxLength(15);
        po.HasIndex(p => new { p.TenantId, p.CreatedAtUtc });
        po.HasIndex(p => new { p.TenantId, p.Status });
        po.HasIndex(p => new { p.TenantId, p.SupplierId });
        po.Ignore(p => p.TotalFob);
        po.Ignore(p => p.TotalExpensesArs);
        po.Ignore(p => p.IsEditable);
        po.Ignore(p => p.IsOpen);

        var supplier = modelBuilder.Entity<Supplier>();
        supplier.ToTable("suppliers");
        supplier.HasKey(s => s.Id);
        supplier.Property(s => s.Id).ValueGeneratedNever();
        supplier.HasQueryFilter(s => !_filterByTenant || s.TenantId == _tenantGuid);
        supplier.Property(s => s.Name).HasMaxLength(120).IsRequired();
        supplier.Property(s => s.TaxId).HasMaxLength(20);
        supplier.Property(s => s.Email).HasMaxLength(200);
        supplier.Property(s => s.Phone).HasMaxLength(40);
        supplier.Property(s => s.Address).HasMaxLength(200);
        supplier.Property(s => s.Country).HasMaxLength(60);
        supplier.Property(s => s.Notes).HasMaxLength(1000);
        supplier.HasIndex(s => new { s.TenantId, s.Name });

        po.OwnsMany(p => p.Items, items =>
        {
            items.ToTable("purchase_order_items");
            items.WithOwner().HasForeignKey("purchase_order_id");
            items.HasKey(i => i.Id);
            items.Property(i => i.Id).ValueGeneratedNever();
            items.Property(i => i.ProductName).HasMaxLength(255);
            items.Property(i => i.VariantDescription).HasMaxLength(200);
            items.Property(i => i.Sku).HasMaxLength(64);
            items.Property(i => i.UnitCost).HasPrecision(18, 2);
        });

        po.OwnsMany(p => p.Expenses, expenses =>
        {
            expenses.ToTable("purchase_expenses");
            expenses.WithOwner().HasForeignKey("purchase_order_id");
            expenses.HasKey(e => e.Id);
            expenses.Property(e => e.Id).ValueGeneratedNever();
            expenses.Property(e => e.Label).HasMaxLength(80).IsRequired();
            expenses.Property(e => e.Amount).HasPrecision(18, 2);
        });

        po.Navigation(p => p.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
        po.Navigation(p => p.Expenses).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
