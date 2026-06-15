using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Checkout.Infrastructure.Persistence;

public sealed class CheckoutDbContext(DbContextOptions<CheckoutDbContext> options) : DbContext(options)
{
    public DbSet<CheckoutSession> Sessions => Set<CheckoutSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var session = modelBuilder.Entity<CheckoutSession>();
        session.ToTable("checkout_sessions");
        session.HasKey(s => s.Id);
        session.Property(s => s.Id).ValueGeneratedNever();
        session.Property(s => s.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        session.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
        session.Property(s => s.Email).HasMaxLength(200);
        session.Property(s => s.Currency).HasMaxLength(3);
        session.HasIndex(s => new { s.TenantId, s.CreatedAtUtc });
        session.HasIndex(s => new { s.Status, s.ExpiresAtUtc });
        session.Ignore(s => s.DomainEvents);
        session.Ignore(s => s.Subtotal);

        session.OwnsMany(s => s.Items, items =>
        {
            items.ToTable("checkout_items");
            items.WithOwner().HasForeignKey("session_id");
            items.HasKey(i => i.Id);
            items.Property(i => i.Id).ValueGeneratedNever();
            items.Property(i => i.ProductName).HasMaxLength(255);
            items.Property(i => i.VariantDescription).HasMaxLength(200);
            items.Property(i => i.Sku).HasMaxLength(64);
            items.Ignore(i => i.LineTotal);

            // Money como dos columnas escalares vía conversión simple:
            // owned types no soportan ComplexProperty (mismo caso que Variant).
            items.Property(i => i.UnitPrice)
                .HasConversion(
                    m => m.AmountInMinorUnits + "|" + m.Currency,
                    s => ParseMoney(s))
                .HasColumnName("unit_price")
                .HasMaxLength(24);
        });

        session.Navigation(s => s.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
    }

    private static Money ParseMoney(string serialized)
    {
        var parts = serialized.Split('|');
        return new Money(long.Parse(parts[0]), parts[1]);
    }
}
