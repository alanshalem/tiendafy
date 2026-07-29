using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Notifications.Infrastructure;

public sealed class NotificationsDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public NotificationsDbContext(DbContextOptions<NotificationsDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<WhatsAppConnection> WhatsAppConnections => Set<WhatsAppConnection>();
    public DbSet<WhatsAppTemplate> WhatsAppTemplates => Set<WhatsAppTemplate>();
    public DbSet<NotificationEvent> NotificationEvents => Set<NotificationEvent>();
    public DbSet<EmailCampaign> EmailCampaigns => Set<EmailCampaign>();
    public DbSet<CampaignRecipient> CampaignRecipients => Set<CampaignRecipient>();
    public DbSet<EmailSuppression> EmailSuppressions => Set<EmailSuppression>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var t = modelBuilder.Entity<EmailTemplate>();
        t.ToTable("email_templates");
        t.HasKey(x => x.Id);
        t.Property(x => x.Id).ValueGeneratedNever();
        t.Property(x => x.Type).HasMaxLength(40);
        t.Property(x => x.Subject).HasMaxLength(255);
        t.Property(x => x.BodyHtml).HasColumnType("text");
        t.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        t.HasIndex(x => new { x.TenantId, x.Type }).IsUnique();

        var wc = modelBuilder.Entity<WhatsAppConnection>();
        wc.ToTable("whatsapp_connections");
        wc.HasKey(x => x.Id);
        wc.Property(x => x.Id).ValueGeneratedNever();
        wc.Property(x => x.PhoneNumberId).HasMaxLength(40).IsRequired();
        wc.Property(x => x.AccessTokenEncrypted).HasColumnType("text").IsRequired();
        wc.Property(x => x.DisplayPhoneNumber).HasMaxLength(40);
        wc.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        wc.HasIndex(x => x.TenantId).IsUnique();

        var wt = modelBuilder.Entity<WhatsAppTemplate>();
        wt.ToTable("whatsapp_templates");
        wt.HasKey(x => x.Id);
        wt.Property(x => x.Id).ValueGeneratedNever();
        wt.Property(x => x.Type).HasMaxLength(40).IsRequired();
        wt.Property(x => x.MetaTemplateName).HasMaxLength(120).IsRequired();
        wt.Property(x => x.LanguageCode).HasMaxLength(10).IsRequired();
        wt.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        wt.HasIndex(x => new { x.TenantId, x.Type }).IsUnique();

        var ec = modelBuilder.Entity<EmailCampaign>();
        ec.ToTable("email_campaigns");
        ec.HasKey(x => x.Id);
        ec.Property(x => x.Id).ValueGeneratedNever();
        ec.Property(x => x.Subject).HasMaxLength(255).IsRequired();
        ec.Property(x => x.BodyHtml).HasColumnType("text").IsRequired();
        ec.Property(x => x.Audience).HasMaxLength(20);
        ec.Property(x => x.Status).HasMaxLength(20);
        ec.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        ec.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        // El worker cruza tenants buscando "sending" (sin filtro en su scope).
        ec.HasIndex(x => x.Status);

        var cr = modelBuilder.Entity<CampaignRecipient>();
        cr.ToTable("campaign_recipients");
        cr.HasKey(x => x.Id);
        cr.Property(x => x.Id).ValueGeneratedNever();
        cr.Property(x => x.Email).HasMaxLength(200).IsRequired();
        cr.Property(x => x.Status).HasMaxLength(10);
        cr.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        cr.HasIndex(x => new { x.CampaignId, x.Status });
        cr.HasIndex(x => new { x.CampaignId, x.Email }).IsUnique();

        var es = modelBuilder.Entity<EmailSuppression>();
        es.ToTable("email_suppressions");
        es.HasKey(x => x.Id);
        es.Property(x => x.Id).ValueGeneratedNever();
        es.Property(x => x.Email).HasMaxLength(200).IsRequired();
        es.Property(x => x.Reason).HasMaxLength(20);
        es.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        es.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();

        var ne = modelBuilder.Entity<NotificationEvent>();
        ne.ToTable("notification_events");
        ne.HasKey(x => x.Id);
        ne.Property(x => x.Id).ValueGeneratedNever();
        ne.Property(x => x.Channel).HasMaxLength(10).IsRequired();
        ne.Property(x => x.Template).HasMaxLength(40);
        ne.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        // Consultas del panel de uso: conteos por tienda/canal/rango de fechas.
        ne.HasIndex(x => new { x.TenantId, x.Channel, x.CreatedAtUtc });
    }
}
