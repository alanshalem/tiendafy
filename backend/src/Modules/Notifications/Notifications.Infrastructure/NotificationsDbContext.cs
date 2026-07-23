using Microsoft.EntityFrameworkCore;

namespace Notifications.Infrastructure;

public sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
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
        t.HasIndex(x => new { x.TenantId, x.Type }).IsUnique();

        var wc = modelBuilder.Entity<WhatsAppConnection>();
        wc.ToTable("whatsapp_connections");
        wc.HasKey(x => x.Id);
        wc.Property(x => x.Id).ValueGeneratedNever();
        wc.Property(x => x.PhoneNumberId).HasMaxLength(40).IsRequired();
        wc.Property(x => x.AccessTokenEncrypted).HasColumnType("text").IsRequired();
        wc.Property(x => x.DisplayPhoneNumber).HasMaxLength(40);
        wc.HasIndex(x => x.TenantId).IsUnique();

        var wt = modelBuilder.Entity<WhatsAppTemplate>();
        wt.ToTable("whatsapp_templates");
        wt.HasKey(x => x.Id);
        wt.Property(x => x.Id).ValueGeneratedNever();
        wt.Property(x => x.Type).HasMaxLength(40).IsRequired();
        wt.Property(x => x.MetaTemplateName).HasMaxLength(120).IsRequired();
        wt.Property(x => x.LanguageCode).HasMaxLength(10).IsRequired();
        wt.HasIndex(x => new { x.TenantId, x.Type }).IsUnique();
    }
}
