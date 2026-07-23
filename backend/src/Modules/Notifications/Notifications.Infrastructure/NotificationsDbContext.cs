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
    }
}
