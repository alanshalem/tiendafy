using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Social.Infrastructure;

public sealed class SocialDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public SocialDbContext(DbContextOptions<SocialDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<SocialAccount> Accounts => Set<SocialAccount>();
    public DbSet<SocialPost> Posts => Set<SocialPost>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var account = modelBuilder.Entity<SocialAccount>();
        account.ToTable("social_accounts");
        account.HasKey(a => a.Id);
        account.Property(a => a.Id).ValueGeneratedNever();
        account.HasQueryFilter(a => !_filterByTenant || a.TenantId == _tenantGuid);
        account.Property(a => a.Provider).HasMaxLength(30);
        account.Property(a => a.ProviderId).HasMaxLength(80);
        account.Property(a => a.Name).HasMaxLength(200);
        account.Property(a => a.Username).HasMaxLength(120);
        account.Property(a => a.AvatarUrl).HasMaxLength(500);
        account.Property(a => a.AccessTokenEncrypted).HasMaxLength(4096);
        account.Property(a => a.DataJson).HasMaxLength(2000);
        // Reconectar la misma cuenta repara el token, no duplica (Mixpost).
        account.HasIndex(a => new { a.TenantId, a.Provider, a.ProviderId }).IsUnique();

        var post = modelBuilder.Entity<SocialPost>();
        post.ToTable("social_posts");
        post.HasKey(p => p.Id);
        post.Property(p => p.Id).ValueGeneratedNever();
        post.HasQueryFilter(p => !_filterByTenant || p.TenantId == _tenantGuid);
        post.Property(p => p.Content).HasMaxLength(10_000);
        post.Property(p => p.MediaUrlsJson).HasMaxLength(8000);
        post.Property(p => p.CouponCode).HasMaxLength(40);
        post.Property(p => p.Status).HasConversion<string>().HasMaxLength(12);
        post.Property(p => p.ScheduleStatus).HasConversion<string>().HasMaxLength(12);
        post.HasIndex(p => new { p.TenantId, p.ScheduledAtUtc });
        post.HasIndex(p => new { p.Status, p.ScheduleStatus, p.ScheduledAtUtc }); // claim del publicador
        post.Ignore(p => p.IsEditable);

        post.OwnsMany(p => p.Targets, targets =>
        {
            targets.ToTable("social_post_targets");
            targets.WithOwner().HasForeignKey("post_id");
            targets.HasKey(t => t.Id);
            targets.Property(t => t.Id).ValueGeneratedNever();
            targets.Property(t => t.ContentOverride).HasMaxLength(10_000);
            targets.Property(t => t.ProviderPostId).HasMaxLength(120);
            targets.Property(t => t.ExternalUrl).HasMaxLength(500);
            targets.Property(t => t.Error).HasMaxLength(500);
        });
        post.Navigation(p => p.Targets).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
