using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Checkout.Infrastructure.Persistence;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<CheckoutDbContext>
{
    public CheckoutDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<CheckoutDbContext>());
}
