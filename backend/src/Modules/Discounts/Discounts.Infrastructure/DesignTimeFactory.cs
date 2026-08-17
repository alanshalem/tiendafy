using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Discounts.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<DiscountsDbContext>
{
    public DiscountsDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<DiscountsDbContext>());
}
