using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using Checkout.Infrastructure.Carriers;
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
        services.AddScoped<IAndreaniRepository, AndreaniRepository>();
        services.AddScoped<IShipmentClaimRepository, ShipmentClaimRepository>();
        services.AddScoped<StartCheckoutHandler>();
        services.AddScoped<SubmitCheckoutHandler>();

        AddCarriers(services);

        return services;
    }

    /// <summary>
    /// Los adaptadores de los carriers. Vivían en la Api aunque son de este
    /// módulo: sus configuraciones y sus envíos ya se guardaban acá.
    /// </summary>
    private static void AddCarriers(IServiceCollection services)
    {
        services.AddSingleton<ShippingSecretProtector>();

        // Correo Argentino (API MiCorreo): cotización en checkout + envíos desde admin.
        services.AddMemoryCache();
        services.AddHttpClient<MiCorreoClient>(c => c.Timeout = TimeSpan.FromSeconds(15));

        // Zipnova: SIN retries (la creación de envíos no es idempotente). 20 s
        // para crear envíos y bajar etiquetas; cotizar corta antes, a los
        // ZipnovaClient.QuoteTimeout, porque está en el camino del checkout.
        services.AddHttpClient<ZipnovaClient>(c => c.Timeout = TimeSpan.FromSeconds(20));

        // El timeout real lo pone cada operación: cotizar corta a los 6 s
        // porque está en el camino del checkout, despachar tolera 20.
        services.AddHttpClient<AndreaniClient>(c => c.Timeout = TimeSpan.FromSeconds(40));
    }
}
