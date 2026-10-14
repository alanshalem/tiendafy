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
    public DbSet<InboxThreadState> InboxStates => Set<InboxThreadState>();
    public DbSet<InboxReply> InboxReplies => Set<InboxReply>();

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

        // Bandeja unificada: una fila por conversación de cualquier canal.
        var state = modelBuilder.Entity<InboxThreadState>();
        state.ToTable("inbox_thread_states");
        state.HasKey(s => s.Id);
        state.Property(s => s.Id).ValueGeneratedNever();
        state.Property(s => s.Channel).HasMaxLength(20).IsRequired();
        state.Property(s => s.ExternalId).HasMaxLength(64).IsRequired();
        state.Property(s => s.AssignedUserName).HasMaxLength(200);
        state.Property(s => s.Title).HasMaxLength(200);
        state.HasQueryFilter(s => !_filterByTenant || s.TenantId == _tenantGuid);
        state.HasIndex(s => new { s.TenantId, s.Channel, s.ExternalId }).IsUnique();
        state.HasIndex(s => new { s.TenantId, s.AssignedUserId }); // "asignadas a mí"

        var reply = modelBuilder.Entity<InboxReply>();
        reply.ToTable("inbox_replies");
        reply.HasKey(r => r.Id);
        reply.Property(r => r.Id).ValueGeneratedNever();
        reply.Property(r => r.Channel).HasMaxLength(20).IsRequired();
        reply.Property(r => r.ExternalId).HasMaxLength(64).IsRequired();
        reply.Property(r => r.AuthorName).HasMaxLength(200).IsRequired();
        reply.Property(r => r.Body).HasMaxLength(4000).IsRequired();
        reply.HasQueryFilter(r => !_filterByTenant || r.TenantId == _tenantGuid);
        reply.HasIndex(r => new { r.TenantId, r.Channel, r.ExternalId, r.CreatedAtUtc });
    }
}
