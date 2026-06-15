using Microsoft.EntityFrameworkCore;

namespace Discounts.Infrastructure;

public sealed class DiscountsDbContext(DbContextOptions<DiscountsDbContext> options) : DbContext(options)
{
    public DbSet<Coupon> Coupons => Set<Coupon>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var coupon = modelBuilder.Entity<Coupon>();
        coupon.ToTable("coupons");
        coupon.HasKey(c => c.Id);
        coupon.Property(c => c.Id).ValueGeneratedNever();

        // Código único por tenant (índice arranca en tenant_id).
        coupon.HasIndex(c => new { c.TenantId, c.Code }).IsUnique();

        coupon.Property(c => c.Code).HasMaxLength(50).IsRequired();
        coupon.Property(c => c.Type).HasConversion<string>().HasMaxLength(20);
        coupon.Property(c => c.Value);
        coupon.Property(c => c.MinPurchase);
        coupon.Property(c => c.StartsAtUtc);
        coupon.Property(c => c.EndsAtUtc);
        coupon.Property(c => c.MaxUses);
        coupon.Property(c => c.UsedCount);
        coupon.Property(c => c.Active);
        coupon.Property(c => c.CreatedAtUtc);
    }
}
