using Microsoft.EntityFrameworkCore;

namespace Notifications.Infrastructure;

public sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();

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
    }
}
