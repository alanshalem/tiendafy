using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Ai.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AiDbContext>
{
    public AiDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<AiDbContext>());
}
