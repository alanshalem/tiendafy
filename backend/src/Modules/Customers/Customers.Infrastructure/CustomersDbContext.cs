using Microsoft.EntityFrameworkCore;

namespace Customers.Infrastructure;

public sealed class CustomersDbContext(DbContextOptions<CustomersDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerSession> CustomerSessions => Set<CustomerSession>();
    public DbSet<CustomerFavorite> CustomerFavorites => Set<CustomerFavorite>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var c = modelBuilder.Entity<Customer>();
        c.ToTable("customers");
        c.HasKey(x => x.Id);
        c.Property(x => x.Id).ValueGeneratedNever();
        c.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        // Email único por tienda entre cuentas de comprador (login).
        c.HasIndex(x => new { x.TenantId, x.Email });
        c.Property(x => x.Name).HasMaxLength(120).IsRequired();
        c.Property(x => x.Email).HasMaxLength(200);
        c.Property(x => x.Phone).HasMaxLength(40);
        c.Property(x => x.Address).HasMaxLength(300);
        c.Property(x => x.Notes).HasMaxLength(2000);
        c.Property(x => x.PasswordHash).HasMaxLength(400);
        c.Property(x => x.GoogleSubject).HasMaxLength(100);

        var s = modelBuilder.Entity<CustomerSession>();
        s.ToTable("customer_sessions");
        s.HasKey(x => x.Id);
        s.Property(x => x.Id).ValueGeneratedNever();
        s.HasIndex(x => x.Token).IsUnique();
        s.Property(x => x.Token).HasMaxLength(120).IsRequired();

        var f = modelBuilder.Entity<CustomerFavorite>();
        f.ToTable("customer_favorites");
        f.HasKey(x => x.Id);
        f.Property(x => x.Id).ValueGeneratedNever();
        f.HasIndex(x => new { x.CustomerId, x.ProductId }).IsUnique();
    }
}
