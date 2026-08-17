using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Tenancy.Infrastructure.Persistence;

/// <summary>Solo para `dotnet ef migrations` — runtime usa DI del host.</summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<TenancyDbContext>
{
    public TenancyDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<TenancyDbContext>());
}
