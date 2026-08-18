using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Purchasing.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<PurchasingDbContext>
{
    public PurchasingDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<PurchasingDbContext>());
}
