using Checkout.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace Checkout.Infrastructure.Persistence;

public sealed class CheckoutDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private TenantId CurrentTenant => FilterByTenant ? _tenant!.TenantId : default;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public CheckoutDbContext(DbContextOptions<CheckoutDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    // Teléfono, documento y dirección del comprador cifrados en reposo, como en
    // Customers pero con su propio purpose. Lo setea el host (Program) antes de
    // migrar/servir; null (design-time de migraciones) = columnas en claro.
    // Nunca cambiar el purpose: lo cifrado con el viejo deja de leerse.
    private static IDataProtector? _piiProtector;
    public static void UsePii(IDataProtectionProvider provider) =>
        _piiProtector = provider.CreateProtector("Checkout.PII.v1");

    /// <summary>Las columnas de <see cref="CheckoutSession"/> que van cifradas.</summary>
    public static readonly IReadOnlyList<string> PiiProperties =
        [nameof(CheckoutSession.Phone), nameof(CheckoutSession.DocNumber), nameof(CheckoutSession.ShippingAddress)];

    /// <summary>
    /// Cifra las sesiones que quedaron con esos datos en claro (las de antes
    /// del cifrado). Idempotente; corre en el paso de migración y al arrancar,
    /// nunca en un request.
    /// </summary>
    public Task<int> ProtectLegacyPiiAsync(CancellationToken ct = default) =>
        _piiProtector is null
            ? Task.FromResult(0)
            : PiiColumns.ProtectLegacyRowsAsync<CheckoutSession>(this, _piiProtector, PiiProperties, ct: ct);

    public DbSet<CheckoutSession> Sessions => Set<CheckoutSession>();
    public DbSet<ShippingMethod> ShippingMethods => Set<ShippingMethod>();
    public DbSet<CorreoArgentinoConfig> CorreoArgentinoConfigs => Set<CorreoArgentinoConfig>();
    public DbSet<ZipnovaConfig> ZipnovaConfigs => Set<ZipnovaConfig>();
    public DbSet<ZipnovaShipment> ZipnovaShipments => Set<ZipnovaShipment>();
    public DbSet<AndreaniConfig> AndreaniConfigs => Set<AndreaniConfig>();
    public DbSet<AndreaniShipment> AndreaniShipments => Set<AndreaniShipment>();
    public DbSet<CorreoShipment> CorreoShipments => Set<CorreoShipment>();
    public DbSet<ShipmentClaim> ShipmentClaims => Set<ShipmentClaim>();
    public DbSet<CheckoutSettings> Settings => Set<CheckoutSettings>();
    public DbSet<StorePaymentOptions> PaymentOptions => Set<StorePaymentOptions>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var session = modelBuilder.Entity<CheckoutSession>();
        session.ToTable("checkout_sessions");
        session.HasKey(s => s.Id);
        session.Property(s => s.Id).ValueGeneratedNever();
        session.Property(s => s.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        session.HasQueryFilter(s => FilterByTenant && s.TenantId == CurrentTenant);
        session.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
        // Token de concurrencia optimista sobre xmin (columna de sistema de
        // Postgres, sin DDL), como Order: dos envíos simultáneos de la misma
        // compra reservaban stock los dos y la reserva del que perdía quedaba
        // huérfana. Ahora el segundo guardado choca y devuelve lo que reservó.
        session.Property<uint>("xmin").IsRowVersion().HasColumnName("xmin");
        session.Property(s => s.Email).HasMaxLength(CheckoutSession.EmailMaxLength);
        session.Property(s => s.Currency).HasMaxLength(3);
        session.HasIndex(s => new { s.TenantId, s.CreatedAtUtc });
        session.HasIndex(s => new { s.Status, s.ExpiresAtUtc });
        session.Ignore(s => s.DomainEvents);
        session.Ignore(s => s.Subtotal);
        session.Property(s => s.BuyerName).HasMaxLength(80);
        session.Property(s => s.BuyerLastName).HasMaxLength(80);
        session.Property(s => s.Notes).HasMaxLength(500);
        session.Property(s => s.ShippingMethodName).HasMaxLength(120);
        // Datos que ubican o identifican al comprador: cifrados, en `text` (el
        // ciphertext es más largo y opaco) y sin índice. Nadie filtra ni cotiza
        // con lo guardado (la cotización viaja firmada en su token); el largo lo
        // corta el dominio. Email y nombre quedan en claro: el recupero de
        // carritos los usa para escribirle al comprador y vincularlo.
        var pii = PiiColumns.Converter(() => _piiProtector);
        foreach (var field in PiiProperties)
            session.Property<string?>(field).HasConversion(pii);
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
        settings.HasQueryFilter(x => FilterByTenant && x.TenantId == CurrentTenant);
        // Una sola configuración por tienda: el índice único lo garantiza aunque
        // dos pedidos entren a la vez y los dos vean que no existe.
        settings.HasIndex(x => x.TenantId).IsUnique();
        settings.Property(x => x.CustomerNoteLabel).HasMaxLength(CheckoutSettings.MaxLabelLength);
        settings.Property(x => x.OrderMessageText).HasMaxLength(CheckoutSettings.MaxMessageLength);

        var payment = modelBuilder.Entity<StorePaymentOptions>();
        payment.ToTable("payment_options");
        payment.HasKey(x => x.Id);
        payment.Property(x => x.Id).ValueGeneratedNever();
        payment.Property(x => x.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        payment.HasQueryFilter(x => FilterByTenant && x.TenantId == CurrentTenant);
        // Una por tienda, igual que las opciones del checkout.
        payment.HasIndex(x => x.TenantId).IsUnique();
        payment.Property(x => x.BankName).HasMaxLength(80);
        payment.Property(x => x.AccountHolder).HasMaxLength(120);
        payment.Property(x => x.HolderTaxId).HasMaxLength(20);
        payment.Property(x => x.Cbu).HasMaxLength(22);
        payment.Property(x => x.Alias).HasMaxLength(40);
        payment.Property(x => x.Instructions).HasMaxLength(StorePaymentOptions.MaxInstructionsLength);
        payment.Property(x => x.InstallmentsNote).HasMaxLength(StorePaymentOptions.MaxNoteLength);
        payment.Property(x => x.HoldHours).HasDefaultValue(StorePaymentOptions.DefaultHoldHours);

        var shipping = modelBuilder.Entity<ShippingMethod>();
        shipping.ToTable("shipping_methods");
        shipping.HasKey(m => m.Id);
        shipping.Property(m => m.Id).ValueGeneratedNever();
        shipping.Property(m => m.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        shipping.HasQueryFilter(m => FilterByTenant && m.TenantId == CurrentTenant);
        shipping.Property(m => m.Kind).HasConversion<string>().HasMaxLength(10);
        shipping.Property(m => m.Name).HasMaxLength(120).IsRequired();
        shipping.Property(m => m.Description).HasMaxLength(300);
        shipping.Property(m => m.PickupAddress).HasMaxLength(300);
        shipping.Property(m => m.Price)
            .HasConversion(ModuleDb.MoneyConverter)
            .HasColumnName("price")
            .HasMaxLength(24);
        shipping.Property(m => m.FreeAbove)
            .HasConversion(ModuleDb.NullableMoneyConverter)
            .HasColumnName("free_above")
            .HasMaxLength(24);
        shipping.HasIndex(m => new { m.TenantId, m.SortOrder });
        shipping.Ignore(m => m.DomainEvents);

        var correo = modelBuilder.Entity<CorreoArgentinoConfig>();
        correo.ToTable("correo_argentino_configs");
        correo.HasKey(c => c.Id);
        correo.Property(c => c.Id).ValueGeneratedNever();
        correo.HasIndex(c => c.TenantId).IsUnique();
        correo.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
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
        zipnova.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
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
        zipShipment.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
        zipShipment.Property(s => s.CarrierName).HasMaxLength(120);
        zipShipment.Property(s => s.CarrierTrackingId).HasMaxLength(80);
        zipShipment.Property(s => s.TrackingUrl).HasMaxLength(500);
        zipShipment.Property(s => s.Status).HasMaxLength(40);

        var andreani = modelBuilder.Entity<AndreaniConfig>();
        andreani.ToTable("andreani_configs");
        andreani.HasKey(c => c.Id);
        andreani.Property(c => c.Id).ValueGeneratedNever();
        andreani.HasIndex(c => c.TenantId).IsUnique();
        andreani.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
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
        andreaniShipment.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
        // Andreani no tiene idempotencia ni cancelación: un envío duplicado no
        // se puede deshacer y se factura igual. El índice garantiza una fila por
        // venta; que no se llame dos veces a Andreani lo garantiza shipment_claims.
        andreaniShipment.HasIndex(s => new { s.TenantId, s.OrderId }).IsUnique();
        andreaniShipment.HasIndex(s => s.TrackingNumber);
        andreaniShipment.Property(s => s.TrackingNumber).HasMaxLength(40).IsRequired();
        andreaniShipment.Property(s => s.AllTrackingNumbers).HasMaxLength(500);
        andreaniShipment.Property(s => s.LabelUrl).HasMaxLength(500);
        andreaniShipment.Property(s => s.ContractUsed).HasMaxLength(30);
        andreaniShipment.Property(s => s.BranchName).HasMaxLength(120);
        andreaniShipment.Property(s => s.Status).HasMaxLength(30).IsRequired();
        andreaniShipment.Property(s => s.RawStatus).HasMaxLength(80);

        var correoShipment = modelBuilder.Entity<CorreoShipment>();
        correoShipment.ToTable("correo_shipments");
        correoShipment.HasKey(s => s.Id);
        correoShipment.Property(s => s.Id).ValueGeneratedNever();
        correoShipment.HasQueryFilter(s => FilterByTenant && s.TenantId == TenantGuid);
        // Un alta por venta: no se sabe si MiCorreo deduplica por extOrderId.
        correoShipment.HasIndex(s => new { s.TenantId, s.OrderId }).IsUnique();
        correoShipment.Property(s => s.DeliveryType).HasMaxLength(1).IsRequired();
        correoShipment.Property(s => s.Agency).HasMaxLength(20);
        correoShipment.Property(s => s.RemoteCreatedAt).HasMaxLength(40);

        // Write-ahead de la creación de envíos (ver ShipmentClaim): el índice
        // único decide quién llama al carrier cuando llegan dos pedidos juntos.
        var claim = modelBuilder.Entity<ShipmentClaim>();
        claim.ToTable("shipment_claims");
        claim.HasKey(c => c.Id);
        claim.Property(c => c.Id).ValueGeneratedNever();
        claim.HasQueryFilter(c => FilterByTenant && c.TenantId == TenantGuid);
        claim.HasIndex(c => new { c.TenantId, c.OrderId, c.Carrier }).IsUnique();
        claim.Property(c => c.Carrier).HasMaxLength(20).IsRequired();
        claim.Property(c => c.Status).HasMaxLength(20).IsRequired();
        claim.Property(c => c.Note).HasMaxLength(ShipmentClaim.MaxNoteLength);

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
