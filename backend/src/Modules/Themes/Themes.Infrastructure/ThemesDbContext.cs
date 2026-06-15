using Microsoft.EntityFrameworkCore;

namespace Themes.Infrastructure;

public sealed class ThemesDbContext(DbContextOptions<ThemesDbContext> options) : DbContext(options)
{
    public DbSet<ThemeDocument> Themes => Set<ThemeDocument>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var theme = modelBuilder.Entity<ThemeDocument>();
        theme.ToTable("themes");
        theme.HasKey(t => t.Id);
        theme.Property(t => t.Id).ValueGeneratedNever();
        theme.HasIndex(t => t.TenantId).IsUnique();
        theme.Property(t => t.Announcement).HasMaxLength(200);
        theme.Property(t => t.TokensJson).HasColumnType("jsonb");
        theme.Property(t => t.SectionsJson).HasColumnType("jsonb");
        theme.Property(t => t.PublishedConfig).HasColumnType("jsonb");
        theme.Property(t => t.DraftConfig).HasColumnType("jsonb");
    }
}
