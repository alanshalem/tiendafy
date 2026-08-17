using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Customers.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<CustomersDbContext>
{
    public CustomersDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<CustomersDbContext>());
}
