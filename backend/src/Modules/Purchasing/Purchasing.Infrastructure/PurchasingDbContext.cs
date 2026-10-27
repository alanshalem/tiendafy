using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Purchasing.Infrastructure;

public sealed class PurchasingDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public PurchasingDbContext(DbContextOptions<PurchasingDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<StockAlertSettings> StockAlertSettings => Set<StockAlertSettings>();
    public DbSet<StockAlertRule> StockAlertRules => Set<StockAlertRule>();
    public DbSet<StockAlertState> StockAlertStates => Set<StockAlertState>();
    public DbSet<StockAlertOptOut> StockAlertOptOuts => Set<StockAlertOptOut>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var po = modelBuilder.Entity<PurchaseOrder>();
        po.ToTable("purchase_orders");
        po.HasKey(p => p.Id);
        po.Property(p => p.Id).ValueGeneratedNever();
        po.HasQueryFilter(p => FilterByTenant && p.TenantId == TenantGuid);
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
        supplier.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
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

        // Alertas de stock bajo (ver StockAlert.cs).
        var settings = modelBuilder.Entity<StockAlertSettings>();
        settings.ToTable("stock_alert_settings");
        settings.HasKey(s => s.Id);
        settings.Property(s => s.Id).ValueGeneratedNever();
        settings.Property(s => s.Mode).HasMaxLength(12).IsRequired();
        settings.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
        settings.HasIndex(s => s.TenantId).IsUnique();
        // El worker cruza tiendas buscando las que tienen la pasada vencida.
        settings.HasIndex(s => new { s.Mode, s.NextRunAtUtc });

        var rule = modelBuilder.Entity<StockAlertRule>();
        rule.ToTable("stock_alert_rules");
        rule.HasKey(r => r.Id);
        rule.Property(r => r.Id).ValueGeneratedNever();
        rule.HasQueryFilter(r => FilterByTenant && r.TenantId == TenantGuid);
        rule.HasIndex(r => new { r.TenantId, r.VariantId }).IsUnique();
        rule.Ignore(r => r.IsDefault);

        var state = modelBuilder.Entity<StockAlertState>();
        state.ToTable("stock_alert_states");
        state.HasKey(s => s.Id);
        state.Property(s => s.Id).ValueGeneratedNever();
        state.Property(s => s.Reason).HasMaxLength(12);
        state.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
        state.HasIndex(s => new { s.TenantId, s.VariantId }).IsUnique();
        state.HasIndex(s => new { s.TenantId, s.IsLow });
        state.Ignore(s => s.PendingNotification);

        var optOut = modelBuilder.Entity<StockAlertOptOut>();
        optOut.ToTable("stock_alert_opt_outs");
        optOut.HasKey(o => o.Id);
        optOut.Property(o => o.Id).ValueGeneratedNever();
        optOut.HasQueryFilter(o => FilterByTenant && o.TenantId == TenantGuid);
        optOut.HasIndex(o => new { o.TenantId, o.UserId }).IsUnique();
    }
}
