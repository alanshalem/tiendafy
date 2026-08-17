using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace Themes.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<ThemesDbContext>
{
    public ThemesDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<ThemesDbContext>());
}
