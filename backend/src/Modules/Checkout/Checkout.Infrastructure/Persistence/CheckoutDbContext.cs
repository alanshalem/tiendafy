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
    private readonly Guid _tenantGuid;

    public CheckoutDbContext(DbContextOptions<CheckoutDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _currentTenant = _filterByTenant ? tenant!.TenantId : default;
        _tenantGuid = _currentTenant.Value;
    }

    public DbSet<CheckoutSession> Sessions => Set<CheckoutSession>();
    public DbSet<ShippingMethod> ShippingMethods => Set<ShippingMethod>();
    public DbSet<CorreoArgentinoConfig> CorreoArgentinoConfigs => Set<CorreoArgentinoConfig>();
    public DbSet<ZipnovaConfig> ZipnovaConfigs => Set<ZipnovaConfig>();
    public DbSet<ZipnovaShipment> ZipnovaShipments => Set<ZipnovaShipment>();
    public DbSet<AndreaniConfig> AndreaniConfigs => Set<AndreaniConfig>();
    public DbSet<AndreaniShipment> AndreaniShipments => Set<AndreaniShipment>();
    public DbSet<CheckoutSettings> Settings => Set<CheckoutSettings>();

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

        var settings = modelBuilder.Entity<CheckoutSettings>();
        settings.ToTable("checkout_settings");
        settings.HasKey(x => x.Id);
        settings.Property(x => x.Id).ValueGeneratedNever();
        settings.Property(x => x.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        settings.HasQueryFilter(x => !_filterByTenant || x.TenantId == _currentTenant);
        // Una sola configuración por tienda: el índice único lo garantiza aunque
        // dos pedidos entren a la vez y los dos vean que no existe.
        settings.HasIndex(x => x.TenantId).IsUnique();
        settings.Property(x => x.CustomerNoteLabel).HasMaxLength(CheckoutSettings.MaxLabelLength);
        settings.Property(x => x.OrderMessageText).HasMaxLength(CheckoutSettings.MaxMessageLength);

        var shipping = modelBuilder.Entity<ShippingMethod>();
        shipping.ToTable("shipping_methods");
        shipping.HasKey(m => m.Id);
        shipping.Property(m => m.Id).ValueGeneratedNever();
        shipping.Property(m => m.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        shipping.HasQueryFilter(m => !_filterByTenant || m.TenantId == _currentTenant);
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
        correo.HasQueryFilter(c => !_filterByTenant || c.TenantId == _tenantGuid);
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
        zipnova.HasQueryFilter(c => !_filterByTenant || c.TenantId == _tenantGuid);
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
        zipShipment.HasQueryFilter(s => !_filterByTenant || s.TenantId == _tenantGuid);
        zipShipment.Property(s => s.CarrierName).HasMaxLength(120);
        zipShipment.Property(s => s.CarrierTrackingId).HasMaxLength(80);
        zipShipment.Property(s => s.TrackingUrl).HasMaxLength(500);
        zipShipment.Property(s => s.Status).HasMaxLength(40);

        var andreani = modelBuilder.Entity<AndreaniConfig>();
        andreani.ToTable("andreani_configs");
        andreani.HasKey(c => c.Id);
        andreani.Property(c => c.Id).ValueGeneratedNever();
        andreani.HasIndex(c => c.TenantId).IsUnique();
        andreani.HasQueryFilter(c => !_filterByTenant || c.TenantId == _tenantGuid);
        andreani.Property(c => c.Username).HasMaxLength(120).IsRequired();
        andreani.Property(c => c.PasswordEncrypted).IsRequired();
        andreani.Property(c => c.ClientCode).HasMaxLength(20);
        // Un contrato por modalidad: para ofrecer domicilio Y sucursal hacen
        // falta los dos, y son dos cotizaciones distintas.
        andreani.Property(c => c.HomeDeliveryContract).HasMaxLength(30);
        andreani.Property(c => c.BranchPickupContract).HasMaxLength(30);
        andreani.Property(c => c.OriginBranch).HasMaxLength(20);
        andreani.Property(c => c.VolumetricFactor).HasColumnType("numeric(6,3)");
        andreani.Property(c => c.SenderName).HasMaxLength(40);
        andreani.Property(c => c.SenderEmail).HasMaxLength(40);
        andreani.Property(c => c.SenderDocumentType).HasMaxLength(10);
        andreani.Property(c => c.SenderDocumentNumber).HasMaxLength(20);
        andreani.Property(c => c.SenderPhone).HasMaxLength(15);
        andreani.Property(c => c.OriginStreet).HasMaxLength(40);
        andreani.Property(c => c.OriginNumber).HasMaxLength(40);
        andreani.Property(c => c.OriginCity).HasMaxLength(40);
        andreani.Property(c => c.OriginPostalCode).HasMaxLength(12);

        var andreaniShipment = modelBuilder.Entity<AndreaniShipment>();
        andreaniShipment.ToTable("andreani_shipments");
        andreaniShipment.HasKey(s => s.Id);
        andreaniShipment.Property(s => s.Id).ValueGeneratedNever();
        andreaniShipment.HasQueryFilter(s => !_filterByTenant || s.TenantId == _tenantGuid);
        // Andreani no tiene idempotencia ni cancelación: un envío duplicado no
        // se puede deshacer y se factura igual. El índice es la única defensa.
        andreaniShipment.HasIndex(s => new { s.TenantId, s.OrderId }).IsUnique();
        andreaniShipment.HasIndex(s => s.TrackingNumber);
        andreaniShipment.Property(s => s.TrackingNumber).HasMaxLength(40).IsRequired();
        andreaniShipment.Property(s => s.AllTrackingNumbers).HasMaxLength(500);
        andreaniShipment.Property(s => s.LabelUrl).HasMaxLength(500);
        andreaniShipment.Property(s => s.ContractUsed).HasMaxLength(30);
        andreaniShipment.Property(s => s.BranchName).HasMaxLength(120);
        andreaniShipment.Property(s => s.Status).HasMaxLength(30).IsRequired();
        andreaniShipment.Property(s => s.RawStatus).HasMaxLength(80);

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
