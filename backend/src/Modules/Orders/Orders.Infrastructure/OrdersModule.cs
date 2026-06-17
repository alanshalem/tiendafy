using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orders.Core.Domain;
using Orders.Core.Features;
using Orders.Infrastructure.Persistence;

namespace Orders.Infrastructure;

public static class OrdersModule
{
    public static IServiceCollection AddOrdersModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<OrdersDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<CreateOrderHandler>();
        services.AddScoped<SettlePaymentHandler>();

        return services;
    }
}
