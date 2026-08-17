using Microsoft.EntityFrameworkCore.Design;
using SharedKernel.Persistence;

namespace MercadoLibre.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<MeliDbContext>
{
    public MeliDbContext CreateDbContext(string[] args) =>
        new(ModuleDb.DesignTimeOptions<MeliDbContext>());
}
