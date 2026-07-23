using Microsoft.EntityFrameworkCore;
using Payments.Core.Domain;
using SharedKernel.Common;

namespace Payments.Infrastructure.Persistence;

public sealed class PaymentsDbContext(DbContextOptions<PaymentsDbContext> options) : DbContext(options)
{
    public DbSet<MercadoPagoConnection> MercadoPagoConnections => Set<MercadoPagoConnection>();
    public DbSet<PaymentWebhookEvent> PaymentWebhookEvents => Set<PaymentWebhookEvent>();
    public DbSet<PaymentRefund> PaymentRefunds => Set<PaymentRefund>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var wh = modelBuilder.Entity<PaymentWebhookEvent>();
        wh.ToTable("payment_webhook_events");
        wh.HasKey(x => x.Id);
        wh.Property(x => x.Id).ValueGeneratedNever();
        wh.HasIndex(x => new { x.Status, x.CreatedAtUtc }); // cola: pendientes por orden
        // Idempotencia de ingesta: MP reenvía el mismo evento varias veces. El
        // índice único descarta duplicados a nivel DB (el endpoint traga la
        // violación y responde 200), evitando doble procesamiento/notificación.
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
    }
}
