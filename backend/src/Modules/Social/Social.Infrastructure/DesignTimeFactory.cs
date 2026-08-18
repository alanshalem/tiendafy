using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Social.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<SocialDbContext>
{
    public SocialDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<SocialDbContext>());
}
