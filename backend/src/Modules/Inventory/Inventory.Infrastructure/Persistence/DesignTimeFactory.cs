using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Inventory.Infrastructure.Persistence;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<InventoryDbContext>());
}
