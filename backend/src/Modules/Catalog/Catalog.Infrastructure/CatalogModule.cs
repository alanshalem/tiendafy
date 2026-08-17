using Catalog.Core.Domain;
using Catalog.Core.Features.CreateCategory;
using Catalog.Core.Features.CreateProduct;
using Catalog.Core.Features.UpdateProduct;
using Catalog.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Catalog.Infrastructure;

public static class CatalogModule
{
    public static IServiceCollection AddCatalogModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<CatalogDbContext>(configuration);

        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<Catalog.Contracts.ICatalogCheckoutQuery, CatalogCheckoutQuery>();
        services.AddScoped<CreateCategoryHandler>(sp => new CreateCategoryHandler(
            sp.GetRequiredService<ICategoryRepository>(),
            sp.GetRequiredService<CatalogDbContext>()));
        services.AddScoped<UpdateProductHandler>(sp => new UpdateProductHandler(
            sp.GetRequiredService<IProductRepository>(),
            sp.GetRequiredService<CatalogDbContext>()));

        // UoW explícito del módulo: cada handler commitea contra SU DbContext.
        // (IUnitOfWork global colisionaría entre módulos.)
        services.AddScoped<CreateProductHandler>(sp => new CreateProductHandler(
            sp.GetRequiredService<IProductRepository>(),
            sp.GetRequiredService<CatalogDbContext>()));

        return services;
    }
}
