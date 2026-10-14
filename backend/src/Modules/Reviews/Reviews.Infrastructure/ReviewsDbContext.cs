using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Reviews.Infrastructure;

public sealed class ReviewsDbContext : DbContext
{
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public ReviewsDbContext(DbContextOptions<ReviewsDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<ProductReview> Reviews => Set<ProductReview>();
    public DbSet<ReviewVote> Votes => Set<ReviewVote>();
    public DbSet<ReviewSettings> Settings => Set<ReviewSettings>();
    public DbSet<ReviewRequest> Requests => Set<ReviewRequest>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var r = modelBuilder.Entity<ProductReview>();
        r.ToTable("product_reviews");
        r.HasKey(x => x.Id);
        r.Property(x => x.Id).ValueGeneratedNever();
        r.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        r.Property(x => x.Status).HasConversion<string>().HasMaxLength(10);
        r.Property(x => x.Title).HasMaxLength(ProductReview.MaxTitle);
        r.Property(x => x.Body).HasMaxLength(ProductReview.MaxBody).IsRequired();
        r.Property(x => x.AuthorName).HasMaxLength(60).IsRequired();
        r.Property(x => x.BuyerEmail).HasMaxLength(200).IsRequired();
        r.Property(x => x.ProductName).HasMaxLength(200).IsRequired();
        r.Property(x => x.VariantLabel).HasMaxLength(120);
        r.Property(x => x.Reply).HasMaxLength(ProductReview.MaxReply);
        // Una reseña por línea de venta: el índice es la regla, no un detalle.
        r.HasIndex(x => new { x.TenantId, x.OrderItemId }).IsUnique();
        // La ficha: las aprobadas de un producto (y el promedio de las cards).
        r.HasIndex(x => new { x.TenantId, x.ProductId, x.Status });
        // La bandeja del panel.
        r.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAtUtc });

        var v = modelBuilder.Entity<ReviewVote>();
        v.ToTable("review_votes");
        v.HasKey(x => x.Id);
        v.Property(x => x.Id).ValueGeneratedNever();
        v.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        v.Property(x => x.Kind).HasMaxLength(10).IsRequired();
        v.Property(x => x.Fingerprint).HasMaxLength(64).IsRequired();
        v.Property(x => x.Reason).HasMaxLength(300);
        // Cada persona cuenta una vez por reseña y por tipo.
        v.HasIndex(x => new { x.ReviewId, x.Kind, x.Fingerprint }).IsUnique();

        var s = modelBuilder.Entity<ReviewSettings>();
        s.ToTable("review_settings");
        s.HasKey(x => x.TenantId);
        s.Property(x => x.TenantId).ValueGeneratedNever();
        s.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var q = modelBuilder.Entity<ReviewRequest>();
        q.ToTable("review_requests");
        q.HasKey(x => x.Id);
        q.Property(x => x.Id).ValueGeneratedNever();
        q.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        q.Property(x => x.Outcome).HasMaxLength(20).IsRequired();
        q.HasIndex(x => new { x.TenantId, x.OrderId }).IsUnique();
    }
}
