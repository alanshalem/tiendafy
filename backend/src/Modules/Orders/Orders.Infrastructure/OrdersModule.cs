using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orders.Core.Domain;
using Orders.Core.Features;
using Orders.Infrastructure.Persistence;
using SharedKernel.Persistence;

namespace Orders.Infrastructure;

public static class OrdersModule
{
    public static IServiceCollection AddOrdersModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<OrdersDbContext>(configuration);

        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<CreateOrderHandler>();
        services.AddScoped<SettlePaymentHandler>();

        return services;
    }
}
