using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using Checkout.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Checkout.Infrastructure;

public static class CheckoutModule
{
    public static IServiceCollection AddCheckoutModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<CheckoutDbContext>(configuration);

        services.AddScoped<ICheckoutRepository, CheckoutRepository>();
        services.AddScoped<IShippingMethodRepository, ShippingMethodRepository>();
        services.AddScoped<ICorreoArgentinoConfigRepository, CorreoArgentinoConfigRepository>();
        services.AddScoped<IZipnovaRepository, ZipnovaRepository>();
        services.AddScoped<StartCheckoutHandler>();
        services.AddScoped<SubmitCheckoutHandler>();

        return services;
    }
}
