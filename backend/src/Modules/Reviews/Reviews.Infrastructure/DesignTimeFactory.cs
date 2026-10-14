using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Reviews.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<ReviewsDbContext>
{
    public ReviewsDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<ReviewsDbContext>());
}
