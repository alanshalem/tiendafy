using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Social.Infrastructure;

public sealed class SocialDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public SocialDbContext(DbContextOptions<SocialDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<SocialAccount> Accounts => Set<SocialAccount>();
    public DbSet<SocialPost> Posts => Set<SocialPost>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var account = modelBuilder.Entity<SocialAccount>();
        account.ToTable("social_accounts");
        account.HasKey(a => a.Id);
        account.Property(a => a.Id).ValueGeneratedNever();
        account.HasQueryFilter(a => FilterByTenant && a.TenantId == TenantGuid);
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
        post.HasQueryFilter(p => FilterByTenant && p.TenantId == TenantGuid);
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
