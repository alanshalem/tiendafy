using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Catalog.Infrastructure.Persistence;

/// <summary>Solo para `dotnet ef migrations` — runtime usa DI del host.</summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<CatalogDbContext>());
}
