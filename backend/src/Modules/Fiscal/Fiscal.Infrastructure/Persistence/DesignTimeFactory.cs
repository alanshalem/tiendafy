using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Fiscal.Infrastructure.Persistence;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<FiscalDbContext>
{
    public FiscalDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<FiscalDbContext>());
}
