using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace MercadoLibre.Infrastructure;

public sealed class MeliDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public MeliDbContext(DbContextOptions<MeliDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<MeliConnection> Connections => Set<MeliConnection>();
    public DbSet<MeliOrder> Orders => Set<MeliOrder>();
    public DbSet<MeliItemLink> ItemLinks => Set<MeliItemLink>();
    public DbSet<MeliNotification> Notifications => Set<MeliNotification>();
    public DbSet<MeliProductCategory> ProductCategories => Set<MeliProductCategory>();
    public DbSet<MeliProductAttribute> ProductAttributes => Set<MeliProductAttribute>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var connection = modelBuilder.Entity<MeliConnection>();
        connection.ToTable("meli_connections");
        connection.HasKey(c => c.Id);
        connection.Property(c => c.Id).ValueGeneratedNever();
        connection.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
        connection.HasIndex(c => c.TenantId).IsUnique();
        // El webhook resuelve el tenant por el user_id de ML (sin header de tenant).
        connection.HasIndex(c => c.MeliUserId);
        connection.Property(c => c.Nickname).HasMaxLength(100);
        connection.Property(c => c.SiteId).HasMaxLength(5);
        connection.Property(c => c.AccessTokenEnc).HasMaxLength(4000);
        connection.Property(c => c.RefreshTokenEnc).HasMaxLength(4000);

        var order = modelBuilder.Entity<MeliOrder>();
        order.ToTable("meli_orders");
        order.HasKey(o => o.Id);
        order.Property(o => o.Id).ValueGeneratedNever();
        order.HasQueryFilter(o => FilterByTenant && o.TenantId == TenantGuid);
        order.HasIndex(o => new { o.TenantId, o.MeliOrderId }).IsUnique();
        order.HasIndex(o => new { o.TenantId, o.DateCreatedUtc });
        order.Property(o => o.Status).HasMaxLength(40);
        order.Property(o => o.CurrencyId).HasMaxLength(5);
        order.Property(o => o.BuyerNickname).HasMaxLength(100);
        order.Property(o => o.ShipmentStatus).HasMaxLength(40);
        order.Property(o => o.ItemsJson).HasColumnType("jsonb");
        order.Property(o => o.StockDeductionsJson).HasColumnType("jsonb");
        order.Ignore(o => o.StockDeductions); // se lee de StockDeductionsJson

        var link = modelBuilder.Entity<MeliItemLink>();
        link.ToTable("meli_item_links");
        link.HasKey(l => l.Id);
        link.Property(l => l.Id).ValueGeneratedNever();
        link.HasQueryFilter(l => FilterByTenant && l.TenantId == TenantGuid);
        link.HasIndex(l => new { l.TenantId, l.MeliItemId, l.MeliVariationId }).IsUnique();
        link.HasIndex(l => new { l.TenantId, l.VariantId });
        link.Property(l => l.MeliItemId).HasMaxLength(30);
        link.Property(l => l.MeliTitle).HasMaxLength(200);

        var productCategory = modelBuilder.Entity<MeliProductCategory>();
        productCategory.ToTable("meli_product_categories");
        productCategory.HasKey(c => new { c.TenantId, c.ProductId });
        productCategory.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
        productCategory.Property(c => c.CategoryId).HasMaxLength(30);
        productCategory.Property(c => c.CategoryName).HasMaxLength(200);
        productCategory.Property(c => c.Source).HasConversion<string>().HasMaxLength(20);

        var productAttribute = modelBuilder.Entity<MeliProductAttribute>();
        productAttribute.ToTable("meli_product_attributes");
        productAttribute.HasKey(a => a.Id);
        productAttribute.Property(a => a.Id).ValueGeneratedNever();
        productAttribute.HasQueryFilter(a => FilterByTenant && a.TenantId == TenantGuid);
        productAttribute.HasIndex(a => new { a.TenantId, a.ProductId, a.AttributeId }).IsUnique();
        productAttribute.Property(a => a.AttributeId).HasMaxLength(60);
        productAttribute.Property(a => a.ValueId).HasMaxLength(60);
        productAttribute.Property(a => a.ValueName).HasMaxLength(500);
        productAttribute.Property(a => a.Unit).HasMaxLength(20);

        // Inbox de webhooks: sin tenant (se resuelve por MeliUserId al procesar).
        var notification = modelBuilder.Entity<MeliNotification>();
        notification.ToTable("meli_notifications");
        notification.HasKey(n => n.Id);
        notification.Property(n => n.Id).ValueGeneratedNever();
        notification.HasIndex(n => new { n.Status, n.NextAttemptAtUtc });
        notification.Property(n => n.Topic).HasMaxLength(60);
        notification.Property(n => n.Resource).HasMaxLength(300);
        notification.Property(n => n.Status).HasMaxLength(10);
        notification.Property(n => n.LastError).HasMaxLength(500);
    }
}
