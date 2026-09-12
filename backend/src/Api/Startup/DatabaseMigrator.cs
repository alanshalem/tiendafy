using Analytics.Infrastructure;
using Catalog.Infrastructure.Persistence;
using Checkout.Infrastructure.Persistence;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Finance.Infrastructure;
using Fiscal.Infrastructure.Persistence;
using Identity.Infrastructure.Persistence;
using Inventory.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using Payments.Infrastructure.Persistence;
using Purchasing.Infrastructure;
using Social.Infrastructure;
using Support.Infrastructure;
using Tenancy.Infrastructure.Persistence;
using Themes.Infrastructure;

namespace Api.Startup;

/// <summary>
/// Aplica las migraciones pendientes de todos los módulos al arrancar.
/// Idempotente: <c>MigrateAsync</c> solo corre lo que falta. Mismo espíritu
/// que <c>EnsureMediaBucketAsync</c> — la infra queda lista antes de servir.
///
/// Nota prod: con varias instancias, conviene gatear esto o correrlo como un
/// paso de deploy aparte para evitar carreras de migración al boot.
/// </summary>
public static class DatabaseMigrator
{
    public static async Task MigrateDatabaseAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseMigrator");

        // Orden: Tenancy primero (raíz multi-tenant), el resto es independiente.
        await MigrateAsync<TenancyDbContext>(sp, logger);
        await MigrateAsync<AppIdentityDbContext>(sp, logger);
        await MigrateAsync<CatalogDbContext>(sp, logger);
        await MigrateAsync<DiscountsDbContext>(sp, logger);
        await MigrateAsync<CustomersDbContext>(sp, logger);
        await MigrateAsync<ContentDbContext>(sp, logger);
        await MigrateAsync<ThemesDbContext>(sp, logger);
        await MigrateAsync<InventoryDbContext>(sp, logger);
        await MigrateAsync<CheckoutDbContext>(sp, logger);
        await MigrateAsync<PaymentsDbContext>(sp, logger);
        await MigrateAsync<OrdersDbContext>(sp, logger);
        await MigrateAsync<AnalyticsDbContext>(sp, logger);
        await MigrateAsync<NotificationsDbContext>(sp, logger);
        await MigrateAsync<SupportDbContext>(sp, logger);
        await MigrateAsync<FiscalDbContext>(sp, logger);
        // Compras e importaciones. Faltaba en esta lista: sus migraciones nunca
        // se aplicaban solas, así que un deploy limpio levantaba sin las tablas
        // del módulo (en desarrollo pasó inadvertido porque ya existían).
        await MigrateAsync<PurchasingDbContext>(sp, logger);
        await MigrateAsync<FinanceDbContext>(sp, logger);
        await MigrateAsync<MeliDbContext>(sp, logger);
        await MigrateAsync<SocialDbContext>(sp, logger);
    }

    private static async Task MigrateAsync<TContext>(IServiceProvider sp, ILogger logger)
        where TContext : DbContext
    {
        var context = sp.GetRequiredService<TContext>();
        var pending = (await context.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count == 0)
        {
            logger.LogDebug("{Context}: sin migraciones pendientes.", typeof(TContext).Name);
            return;
        }

        logger.LogInformation("{Context}: aplicando {Count} migración(es): {Migrations}",
            typeof(TContext).Name, pending.Count, string.Join(", ", pending));
        await context.Database.MigrateAsync();
    }
}
