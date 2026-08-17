using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Support.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<SupportDbContext>
{
    public SupportDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<SupportDbContext>());
}
