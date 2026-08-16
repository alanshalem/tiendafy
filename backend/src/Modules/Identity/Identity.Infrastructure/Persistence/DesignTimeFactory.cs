using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Identity.Infrastructure.Persistence;

/// <summary>Solo para `dotnet ef migrations` — runtime usa DI del host.</summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AppIdentityDbContext>
{
    public AppIdentityDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<AppIdentityDbContext>());
}
