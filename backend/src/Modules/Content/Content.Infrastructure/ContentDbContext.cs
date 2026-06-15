using Microsoft.EntityFrameworkCore;

namespace Content.Infrastructure;

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<Page> Pages => Set<Page>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var page = modelBuilder.Entity<Page>();
        page.ToTable("pages");
        page.HasKey(p => p.Id);
        page.Property(p => p.Id).ValueGeneratedNever();
        page.HasIndex(p => new { p.TenantId, p.Slug }).IsUnique();
        page.Property(p => p.Title).HasMaxLength(120).IsRequired();
        page.Property(p => p.Slug).HasMaxLength(120).IsRequired();
        page.Property(p => p.Body).HasColumnType("text");
        page.Property(p => p.Published);
        page.Property(p => p.CreatedAtUtc);
        page.Property(p => p.UpdatedAtUtc);
    }
}
