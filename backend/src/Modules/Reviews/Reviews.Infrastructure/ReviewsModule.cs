using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Reviews.Infrastructure;

/// <summary>
/// Reseñas de productos con estrellas y fotos. Módulo chico (un proyecto,
/// como Support): las reglas de quién puede opinar cruzan ventas y catálogo,
/// y eso lo orquesta el Api (ReviewEndpoints), no este módulo.
/// </summary>
public static class ReviewsModule
{
    public static IServiceCollection AddReviewsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<ReviewsDbContext>(configuration);

        return services;
    }
}
