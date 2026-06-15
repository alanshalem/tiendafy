using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using Tenancy.Core.Domain;

namespace Tenancy.Infrastructure.Persistence;

/// <summary>
/// DbContext del módulo Tenancy. Dueño exclusivo de sus tablas —
/// ningún otro módulo hace JOIN acá.
/// </summary>
public sealed class TenancyDbContext(DbContextOptions<TenancyDbContext> options)
    : DbContext(options), IUnitOfWork
{
    public DbSet<Tenant> Tenants => Set<Tenant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TenancyDbContext).Assembly);
    }

    Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
        SaveChangesAsync(cancellationToken);
}
