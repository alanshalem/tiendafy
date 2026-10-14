using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace Orders.Infrastructure.Persistence;

public sealed class OrdersDbContext : DbContext
{
    // Filtro multi-tenant global (defensa en profundidad): toda query del path
    // de request queda acotada al tenant actual aunque falte el .Where explícito.
    // Cuando no hay tenant en scope (workers, design-time) se desactiva, para no
    // romper el settle cross-tenant del webhook ni las migraciones.
    private readonly bool _filterByTenant;
    private readonly TenantId _currentTenant;

    public OrdersDbContext(DbContextOptions<OrdersDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _currentTenant = _filterByTenant ? tenant!.TenantId : default;
    }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<OrderNumberCounter> OrderNumberCounters => Set<OrderNumberCounter>();

    /// <summary>
    /// Toda orden nueva sale de acá con su número de tienda, venga del
    /// checkout, de una venta manual, de un presupuesto o del seed: hay cinco
    /// lugares que crean órdenes y ninguno tiene que acordarse de numerarlas.
    /// </summary>
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        await AssignOrderNumbersAsync(cancellationToken);
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        AssignOrderNumbersAsync(CancellationToken.None).GetAwaiter().GetResult();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    private async Task AssignOrderNumbersAsync(CancellationToken ct)
    {
        var pending = ChangeTracker.Entries<Order>()
            .Where(e => e.State == EntityState.Added && e.Entity.Number == 0)
            .Select(e => e.Entity)
            .GroupBy(o => o.TenantId.Value)
            .ToList();

        foreach (var group in pending)
        {
            // En el orden en que se crearon: un lote (el seed, una importación)
            // numera igual que si hubieran entrado de a una.
            var orders = group.OrderBy(o => o.CreatedAtUtc).ToList();
            var next = await OrderNumberCounter.ReserveAsync(this, group.Key, orders.Count, ct);
            foreach (var order in orders) order.AssignNumber(next++);
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var counter = modelBuilder.Entity<OrderNumberCounter>();
        counter.ToTable("order_number_counters");
        counter.HasKey(c => c.TenantId);
        counter.Property(c => c.TenantId).ValueGeneratedNever();
        counter.HasQueryFilter(c => !_filterByTenant || c.TenantId == _currentTenant.Value);

        var order = modelBuilder.Entity<Order>();
        order.ToTable("orders");
        order.HasKey(o => o.Id);
        order.Property(o => o.Id).ValueGeneratedNever();
        order.Property(o => o.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        order.HasQueryFilter(o => !_filterByTenant || o.TenantId == _currentTenant);
        order.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);
        // Token de concurrencia optimista sobre la columna de sistema xmin de
        // Postgres (no requiere migración): dos writes concurrentes al mismo
        // pedido → el segundo SaveChanges lanza DbUpdateConcurrencyException.
        // Usado por el refund para evitar doble aplicación en multi-instancia.
        order.Property<uint>("xmin").IsRowVersion().HasColumnName("xmin");
        order.Property(o => o.Currency).HasMaxLength(3);
        order.Property(o => o.BuyerEmail).HasMaxLength(200);
        order.Property(o => o.PaymentProvider).HasMaxLength(30);
        order.Property(o => o.PreferenceId).HasMaxLength(128);
        order.Property(o => o.PaymentId).HasMaxLength(64);
        order.Property(o => o.CouponCode).HasMaxLength(40);
        order.Property(o => o.UtmSource).HasMaxLength(40);
        order.Property(o => o.DiscountAmount)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("discount_amount")
            .HasMaxLength(24);
        order.Property(o => o.RefundedAmount)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("refunded_amount")
            .HasMaxLength(24)
            .HasDefaultValue(new Money(0, Money.DefaultCurrency));
        order.Property(o => o.ShippingCost)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("shipping_cost")
            .HasMaxLength(24)
            .HasDefaultValue(new Money(0, Money.DefaultCurrency));
        order.Property(o => o.MpFeeAmount)
            .HasConversion(ModuleDb.NullableMoneyConverter)
            .HasColumnName("mp_fee_amount")
            .HasMaxLength(24);
        order.Property(o => o.ShippingMethodName).HasMaxLength(120);
        order.Property(o => o.IsPickup).HasDefaultValue(false);
        order.Property(o => o.ShippingAddress).HasMaxLength(300);
        order.Property(o => o.BuyerName).HasMaxLength(170);
        order.Property(o => o.BuyerPhone).HasMaxLength(40);
        order.Property(o => o.DocNumber).HasMaxLength(20);
        order.Property(o => o.Notes).HasMaxLength(500);
        order.Property(o => o.Channel).HasMaxLength(20).HasDefaultValue(Order.ChannelWeb);
        order.Property(o => o.CancelledBy).HasMaxLength(200);
        order.Property(o => o.CancelReason).HasMaxLength(300);
        order.HasIndex(o => new { o.TenantId, o.CreatedAtUtc });
        // Único por tienda: es el número que se habla por teléfono y se busca
        // en el panel. El contador ya lo garantiza; esto frena una escritura a mano.
        order.HasIndex(o => new { o.TenantId, o.Number }).IsUnique();
        order.HasIndex(o => o.PaymentId);
        order.Ignore(o => o.DomainEvents);
        order.Ignore(o => o.Total);
        order.Ignore(o => o.Subtotal);
        order.Ignore(o => o.ReservationIds);
        order.Ignore(o => o.IsPending);
        order.Ignore(o => o.RemainingRefundable);
        order.Ignore(o => o.ProductCost);
        order.Ignore(o => o.Label);

        order.OwnsMany(o => o.Items, items =>
        {
            items.ToTable("order_items");
            items.WithOwner().HasForeignKey("order_id");
            items.HasKey(i => i.Id);
            items.Property(i => i.Id).ValueGeneratedNever();
            items.Property(i => i.ProductName).HasMaxLength(255);
            items.Property(i => i.VariantDescription).HasMaxLength(200);
            items.Property(i => i.Sku).HasMaxLength(64);
            items.Ignore(i => i.LineTotal);
            items.Property(i => i.UnitPrice)
                .HasConversion(ModuleDb.MoneyConverter)
                .HasColumnName("unit_price")
                .HasMaxLength(24);
            items.Property(i => i.UnitCost)
                .HasConversion(ModuleDb.NullableMoneyConverter)
                .HasColumnName("unit_cost")
                .HasMaxLength(24);
        });

        order.Navigation(o => o.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        var quote = modelBuilder.Entity<Quote>();
        quote.ToTable("quotes");
        quote.HasKey(q => q.Id);
        quote.Property(q => q.Id).ValueGeneratedNever();
        quote.Property(q => q.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        quote.HasQueryFilter(q => !_filterByTenant || q.TenantId == _currentTenant);
        quote.Property(q => q.Number).HasMaxLength(20).IsRequired();
        quote.Property(q => q.Status).HasConversion<string>().HasMaxLength(20);
        quote.Property(q => q.CustomerName).HasMaxLength(160).IsRequired();
        quote.Property(q => q.CustomerEmail).HasMaxLength(200);
        quote.Property(q => q.Currency).HasMaxLength(3);
        quote.Property(q => q.Notes).HasMaxLength(1000);
        quote.Property(q => q.RejectionReason).HasMaxLength(300);
        quote.Property(q => q.DiscountAmount)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("discount_amount")
            .HasMaxLength(24);
        quote.Ignore(q => q.Subtotal);
        quote.Ignore(q => q.Total);
        quote.Ignore(q => q.IsExpired);
        quote.Ignore(q => q.IsEditable);
        // Único por tienda: el número es la referencia que se habla por teléfono.
        quote.HasIndex(q => new { q.TenantId, q.Number }).IsUnique();
        quote.HasIndex(q => new { q.TenantId, q.CreatedAtUtc });

        quote.OwnsMany(q => q.Items, items =>
        {
            items.ToTable("quote_items");
            items.WithOwner().HasForeignKey("quote_id");
            items.HasKey(i => i.Id);
            items.Property(i => i.Id).ValueGeneratedNever();
            items.Property(i => i.ProductName).HasMaxLength(255);
            items.Property(i => i.VariantDescription).HasMaxLength(200);
            items.Property(i => i.Sku).HasMaxLength(64);
            items.Ignore(i => i.LineTotal);
            items.Property(i => i.UnitPrice)
                .HasConversion(ModuleDb.MoneyConverter)
                .HasColumnName("unit_price")
                .HasMaxLength(24);
        });

        quote.Navigation(q => q.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
