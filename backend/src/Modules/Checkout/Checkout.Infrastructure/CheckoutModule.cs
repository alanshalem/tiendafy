using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Checkout.Infrastructure;

public static class CheckoutModule
{
    public static IServiceCollection AddCheckoutModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<CheckoutDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        services.AddScoped<ICheckoutRepository, CheckoutRepository>();
        services.AddScoped<IShippingMethodRepository, ShippingMethodRepository>();
        services.AddScoped<ICorreoArgentinoConfigRepository, CorreoArgentinoConfigRepository>();
        services.AddScoped<IZipnovaRepository, ZipnovaRepository>();
        services.AddScoped<StartCheckoutHandler>();
        services.AddScoped<SubmitCheckoutHandler>();

        return services;
    }
}
