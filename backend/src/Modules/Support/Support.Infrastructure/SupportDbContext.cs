using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Support.Infrastructure;

public sealed class SupportDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public SupportDbContext(DbContextOptions<SupportDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<SupportMessage> Messages => Set<SupportMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var conv = modelBuilder.Entity<Conversation>();
        conv.ToTable("support_conversations");
        conv.HasKey(c => c.Id);
        conv.Property(c => c.Id).ValueGeneratedNever();
        conv.HasQueryFilter(c => !_filterByTenant || c.TenantId == _tenantGuid);
        conv.Property(c => c.Status).HasConversion<string>().HasMaxLength(10);
        conv.Property(c => c.CustomerEmail).HasMaxLength(200).IsRequired();
        conv.HasIndex(c => new { c.TenantId, c.OrderId }).IsUnique(); // una por orden
        conv.HasIndex(c => new { c.TenantId, c.LastMessageAtUtc });   // bandeja admin
        conv.HasIndex(c => new { c.TenantId, c.CustomerId });         // "mis chats"

        var msg = modelBuilder.Entity<SupportMessage>();
        msg.ToTable("support_messages");
        msg.HasKey(m => m.Id);
        msg.Property(m => m.Id).ValueGeneratedNever();
        msg.Property(m => m.AuthorName).HasMaxLength(200).IsRequired();
        msg.Property(m => m.Body).HasMaxLength(4000);
        msg.Property(m => m.AttachmentKey).HasMaxLength(300);
        msg.Property(m => m.AttachmentName).HasMaxLength(255);
        msg.Property(m => m.AttachmentContentType).HasMaxLength(60);
        msg.HasQueryFilter(m => !_filterByTenant || m.TenantId == _tenantGuid);
        msg.HasIndex(m => new { m.ConversationId, m.CreatedAtUtc }); // paginado del hilo
    }
}
