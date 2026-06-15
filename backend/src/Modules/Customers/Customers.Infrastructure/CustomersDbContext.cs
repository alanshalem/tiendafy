using Microsoft.EntityFrameworkCore;

namespace Customers.Infrastructure;

public sealed class CustomersDbContext(DbContextOptions<CustomersDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var c = modelBuilder.Entity<Customer>();
        c.ToTable("customers");
        c.HasKey(x => x.Id);
        c.Property(x => x.Id).ValueGeneratedNever();
        c.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        c.Property(x => x.Name).HasMaxLength(120).IsRequired();
        c.Property(x => x.Email).HasMaxLength(200);
        c.Property(x => x.Phone).HasMaxLength(40);
        c.Property(x => x.Address).HasMaxLength(300);
        c.Property(x => x.Notes).HasMaxLength(2000);
    }
}
