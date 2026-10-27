using Microsoft.EntityFrameworkCore;
using Payments.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Payments.Infrastructure.Persistence;

public sealed class PaymentsDbContext : DbContext
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
    // PaymentWebhookEvent no tiene tenant (se resuelve al procesar): sin filtro.

    public PaymentsDbContext(DbContextOptions<PaymentsDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<MercadoPagoConnection> MercadoPagoConnections => Set<MercadoPagoConnection>();
    public DbSet<PaymentWebhookEvent> PaymentWebhookEvents => Set<PaymentWebhookEvent>();
    public DbSet<PaymentRefund> PaymentRefunds => Set<PaymentRefund>();
    public DbSet<PaywayConnection> PaywayConnections => Set<PaywayConnection>();
    public DbSet<PaywayPaymentAttempt> PaywayPaymentAttempts => Set<PaywayPaymentAttempt>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MercadoPagoConnection>()
            .HasQueryFilter(c => FilterByTenant && c.TenantId == CurrentTenant);
        modelBuilder.Entity<PaymentRefund>()
            .HasQueryFilter(r => FilterByTenant && r.TenantId == TenantGuid);
        modelBuilder.Entity<PaywayConnection>()
            .HasQueryFilter(c => FilterByTenant && c.TenantId == CurrentTenant);
        modelBuilder.Entity<PaywayPaymentAttempt>()
            .HasQueryFilter(a => FilterByTenant && a.TenantId == TenantGuid);

        var wh = modelBuilder.Entity<PaymentWebhookEvent>();
        wh.ToTable("payment_webhook_events");
        wh.HasKey(x => x.Id);
        wh.Property(x => x.Id).ValueGeneratedNever();
        // Cola: el worker pide los pendientes YA vencidos, en orden de vencimiento.
        wh.HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
        // Una fila por pago: los avisos repetidos del mismo pago no se apilan.
        // El endpoint, ante la violación, vuelve a poner en cola la fila ya
        // procesada (MP avisa cada cambio de estado del mismo pago).
        wh.HasIndex(x => new { x.Type, x.DataId }).IsUnique();
        wh.Property(x => x.Type).HasMaxLength(40).IsRequired();
        wh.Property(x => x.DataId).HasMaxLength(64).IsRequired();
        wh.Property(x => x.Status).HasMaxLength(10).IsRequired();
        wh.Property(x => x.LastError).HasMaxLength(500);

        var refund = modelBuilder.Entity<PaymentRefund>();
        refund.ToTable("payment_refunds");
        refund.HasKey(r => r.Id);
        refund.Property(r => r.Id).ValueGeneratedNever();
        refund.Property(r => r.PaymentId).HasMaxLength(64).IsRequired();
        refund.Property(r => r.MercadoPagoRefundId).HasMaxLength(64);
        refund.Property(r => r.Currency).HasMaxLength(3).IsRequired();
        refund.Property(r => r.Reason).HasMaxLength(500);
        refund.Property(r => r.RequestedBy).HasMaxLength(200).IsRequired();
        refund.HasIndex(r => new { r.TenantId, r.OrderId });

        var connection = modelBuilder.Entity<MercadoPagoConnection>();
        connection.ToTable("mp_connections");
        connection.HasKey(c => c.Id);
        connection.Property(c => c.Id).ValueGeneratedNever();
        connection.Property(c => c.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        connection.HasIndex(c => c.TenantId).IsUnique();

        // Tokens cifrados (Data Protection) — opacos, longitud variable.
        connection.Property(c => c.AccessTokenEncrypted).HasColumnType("text");
        connection.Property(c => c.RefreshTokenEncrypted).HasColumnType("text");
        connection.Property(c => c.PublicKey).HasMaxLength(128);
        connection.Property(c => c.Scope).HasMaxLength(200);
        connection.Property(c => c.CheckoutMode).HasConversion<string>().HasMaxLength(10);
        connection.Property(c => c.MarketplaceFeePercent).HasColumnType("numeric(5,2)");
        connection.Property(c => c.StatementDescriptor).HasMaxLength(22);

        connection.Ignore(c => c.DomainEvents);

        var payway = modelBuilder.Entity<PaywayConnection>();
        payway.ToTable("payway_connections");
        payway.HasKey(c => c.Id);
        payway.Property(c => c.Id).ValueGeneratedNever();
        payway.Property(c => c.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        payway.HasIndex(c => c.TenantId).IsUnique();
        payway.Property(c => c.SiteId).HasMaxLength(20).IsRequired();
        payway.Property(c => c.Environment).HasConversion<string>().HasMaxLength(12);
        // La pública viaja al navegador (tokeniza la tarjeta y nada más); la
        // privada va cifrada con Data Protection y no sale del backend.
        payway.Property(c => c.PublicKey).HasMaxLength(128).IsRequired();
        payway.Property(c => c.PrivateKeyEncrypted).HasColumnType("text").IsRequired();
        payway.Property(c => c.BaseUrlOverride).HasMaxLength(200);
        payway.Property(c => c.EstablishmentName).HasMaxLength(60);
        payway.Property<List<int>>("_installmentOptions").HasColumnName("installment_options");
        payway.Ignore(c => c.InstallmentOptions);

        var attempt = modelBuilder.Entity<PaywayPaymentAttempt>();
        attempt.ToTable("payway_payment_attempts");
        attempt.HasKey(a => a.Id);
        attempt.Property(a => a.Id).ValueGeneratedNever();
        attempt.Property(a => a.SiteTransactionId).HasMaxLength(39).IsRequired();
        // Payway no tiene idempotencia: este índice es lo que impide que dos
        // requests en paralelo terminen en dos cobros de la misma orden.
        attempt.HasIndex(a => new { a.TenantId, a.SiteTransactionId }).IsUnique();
        attempt.HasIndex(a => new { a.TenantId, a.OrderId, a.AttemptNumber }).IsUnique();
        attempt.HasIndex(a => new { a.TenantId, a.OrderId });
        attempt.Property(a => a.Status).HasConversion<string>().HasMaxLength(16);
        attempt.Property(a => a.RawStatus).HasMaxLength(40);
        attempt.Property(a => a.ProviderPaymentId).HasMaxLength(64);
        attempt.Property(a => a.Currency).HasMaxLength(3).IsRequired();
        attempt.Property(a => a.CardBin).HasMaxLength(6);
        attempt.Property(a => a.CardLastFour).HasMaxLength(4);
        attempt.Property(a => a.CardBrand).HasMaxLength(30);
        attempt.Property(a => a.AuthorizationCode).HasMaxLength(20);
        attempt.Property(a => a.NetworkTransactionId).HasMaxLength(40);
        attempt.Property(a => a.TicketNumber).HasMaxLength(20);
        attempt.Property(a => a.DeclineDescription).HasMaxLength(200);
    }
}
