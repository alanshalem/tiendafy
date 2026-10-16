using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace MercadoLibre.Infrastructure;

public sealed class MeliDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public MeliDbContext(DbContextOptions<MeliDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<MeliConnection> Connections => Set<MeliConnection>();
    public DbSet<MeliOrder> Orders => Set<MeliOrder>();
    public DbSet<MeliItemLink> ItemLinks => Set<MeliItemLink>();
    public DbSet<MeliNotification> Notifications => Set<MeliNotification>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var connection = modelBuilder.Entity<MeliConnection>();
        connection.ToTable("meli_connections");
        connection.HasKey(c => c.Id);
        connection.Property(c => c.Id).ValueGeneratedNever();
        connection.HasQueryFilter(c => !_filterByTenant || c.TenantId == _tenantGuid);
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
        order.HasQueryFilter(o => !_filterByTenant || o.TenantId == _tenantGuid);
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
        link.HasQueryFilter(l => !_filterByTenant || l.TenantId == _tenantGuid);
        link.HasIndex(l => new { l.TenantId, l.MeliItemId, l.MeliVariationId }).IsUnique();
        link.HasIndex(l => new { l.TenantId, l.VariantId });
        link.Property(l => l.MeliItemId).HasMaxLength(30);
        link.Property(l => l.MeliTitle).HasMaxLength(200);

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
