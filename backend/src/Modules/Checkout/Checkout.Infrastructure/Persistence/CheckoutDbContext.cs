using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace Checkout.Infrastructure.Persistence;

public sealed class CheckoutDbContext : DbContext
{
    // Filtro multi-tenant global (ver OrdersDbContext). Bypass sin tenant en scope
    // (el AbandonedCartWorker recorre sesiones de todos los tenants).
    private readonly bool _filterByTenant;
    private readonly TenantId _currentTenant;

    public CheckoutDbContext(DbContextOptions<CheckoutDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _currentTenant = _filterByTenant ? tenant!.TenantId : default;
    }

    public DbSet<CheckoutSession> Sessions => Set<CheckoutSession>();
    public DbSet<ShippingMethod> ShippingMethods => Set<ShippingMethod>();
    public DbSet<CorreoArgentinoConfig> CorreoArgentinoConfigs => Set<CorreoArgentinoConfig>();
    public DbSet<ZipnovaConfig> ZipnovaConfigs => Set<ZipnovaConfig>();
    public DbSet<ZipnovaShipment> ZipnovaShipments => Set<ZipnovaShipment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var session = modelBuilder.Entity<CheckoutSession>();
        session.ToTable("checkout_sessions");
        session.HasKey(s => s.Id);
        session.Property(s => s.Id).ValueGeneratedNever();
        session.Property(s => s.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        session.HasQueryFilter(s => !_filterByTenant || s.TenantId == _currentTenant);
        session.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
        session.Property(s => s.Email).HasMaxLength(200);
        session.Property(s => s.Currency).HasMaxLength(3);
        session.HasIndex(s => new { s.TenantId, s.CreatedAtUtc });
        session.HasIndex(s => new { s.Status, s.ExpiresAtUtc });
        session.Ignore(s => s.DomainEvents);
        session.Ignore(s => s.Subtotal);
        session.Property(s => s.BuyerName).HasMaxLength(80);
        session.Property(s => s.BuyerLastName).HasMaxLength(80);
        session.Property(s => s.Phone).HasMaxLength(40);
        session.Property(s => s.DocNumber).HasMaxLength(20);
        session.Property(s => s.Notes).HasMaxLength(500);
        session.Property(s => s.ShippingMethodName).HasMaxLength(120);
        session.Property(s => s.ShippingAddress).HasMaxLength(300);
        session.Property(s => s.ShippingCost)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("shipping_cost")
            .HasMaxLength(24)
            .HasDefaultValue(new Money(0, Money.DefaultCurrency));

        var shipping = modelBuilder.Entity<ShippingMethod>();
        shipping.ToTable("shipping_methods");
        shipping.HasKey(m => m.Id);
        shipping.Property(m => m.Id).ValueGeneratedNever();
        shipping.Property(m => m.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        shipping.Property(m => m.Kind).HasConversion<string>().HasMaxLength(10);
        shipping.Property(m => m.Name).HasMaxLength(120).IsRequired();
        shipping.Property(m => m.Description).HasMaxLength(300);
        shipping.Property(m => m.PickupAddress).HasMaxLength(300);
        shipping.Property(m => m.Price)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("price")
            .HasMaxLength(24);
        shipping.HasIndex(m => new { m.TenantId, m.SortOrder });
        shipping.Ignore(m => m.DomainEvents);

        var correo = modelBuilder.Entity<CorreoArgentinoConfig>();
        correo.ToTable("correo_argentino_configs");
        correo.HasKey(c => c.Id);
        correo.Property(c => c.Id).ValueGeneratedNever();
        correo.HasIndex(c => c.TenantId).IsUnique();
        correo.Property(c => c.CustomerId).HasMaxLength(20).IsRequired();
        correo.Property(c => c.UserTokenEncrypted).IsRequired();
        correo.Property(c => c.PasswordTokenEncrypted).IsRequired();
        correo.Property(c => c.Environment).HasMaxLength(10);
        correo.Property(c => c.OriginPostalCode).HasMaxLength(8);

        var zipnova = modelBuilder.Entity<ZipnovaConfig>();
        zipnova.ToTable("zipnova_configs");
        zipnova.HasKey(c => c.Id);
        zipnova.Property(c => c.Id).ValueGeneratedNever();
        zipnova.HasIndex(c => c.TenantId).IsUnique();
        zipnova.Property(c => c.ApiTokenEncrypted).IsRequired();
        zipnova.Property(c => c.ApiSecretEncrypted).IsRequired();
        zipnova.Property(c => c.Country).HasMaxLength(2);
        zipnova.Property(c => c.OriginId).HasMaxLength(20);

        var zipShipment = modelBuilder.Entity<ZipnovaShipment>();
        zipShipment.ToTable("zipnova_shipments");
        zipShipment.HasKey(s => s.Id);
        zipShipment.Property(s => s.Id).ValueGeneratedNever();
        // Guard de idempotencia: un envío Zipnova por orden, garantizado por índice.
        zipShipment.HasIndex(s => new { s.TenantId, s.OrderId }).IsUnique();
        zipShipment.Property(s => s.CarrierName).HasMaxLength(120);
        zipShipment.Property(s => s.CarrierTrackingId).HasMaxLength(80);
        zipShipment.Property(s => s.TrackingUrl).HasMaxLength(500);
        zipShipment.Property(s => s.Status).HasMaxLength(40);

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
                .HasConversion(ModuleDb.MoneyConverter)
                .HasColumnName("unit_price")
                .HasMaxLength(24);
        });

        session.Navigation(s => s.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
