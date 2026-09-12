using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Finance.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<FinanceDbContext>
{
    public FinanceDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<FinanceDbContext>());
}
