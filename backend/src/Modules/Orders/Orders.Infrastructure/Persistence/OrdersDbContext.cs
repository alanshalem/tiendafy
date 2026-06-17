using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Infrastructure.Persistence;

public sealed class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var order = modelBuilder.Entity<Order>();
        order.ToTable("orders");
        order.HasKey(o => o.Id);
        order.Property(o => o.Id).ValueGeneratedNever();
        order.Property(o => o.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        order.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);
        order.Property(o => o.Currency).HasMaxLength(3);
        order.Property(o => o.BuyerEmail).HasMaxLength(200);
        order.Property(o => o.PaymentProvider).HasMaxLength(30);
        order.Property(o => o.PreferenceId).HasMaxLength(128);
        order.Property(o => o.PaymentId).HasMaxLength(64);
        order.Property(o => o.CouponCode).HasMaxLength(40);
        order.Property(o => o.DiscountAmount)
            .HasConversion(
                m => m.AmountInMinorUnits + "|" + m.Currency,
                s => ParseMoney(s))
            .HasColumnName("discount_amount")
            .HasMaxLength(24);
        order.HasIndex(o => new { o.TenantId, o.CreatedAtUtc });
        order.HasIndex(o => o.PaymentId);
        order.Ignore(o => o.DomainEvents);
        order.Ignore(o => o.Total);
        order.Ignore(o => o.Subtotal);
        order.Ignore(o => o.ReservationIds);
        order.Ignore(o => o.IsPending);

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
                .HasConversion(
                    m => m.AmountInMinorUnits + "|" + m.Currency,
                    s => ParseMoney(s))
                .HasColumnName("unit_price")
                .HasMaxLength(24);
        });

        order.Navigation(o => o.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
    }

    private static Money ParseMoney(string serialized)
    {
        var parts = serialized.Split('|');
        return new Money(long.Parse(parts[0]), parts[1]);
    }
}
