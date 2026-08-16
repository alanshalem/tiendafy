using Inventory.Contracts;
using Inventory.Core.Domain;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace Inventory.Infrastructure;

public static class InventoryModule
{
    public static IServiceCollection AddInventoryModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<InventoryDbContext>(configuration);

        services.AddScoped<IStockRepository, StockRepository>();
        services.AddScoped<IInventoryService, InventoryService>();
        services.AddHostedService<ExpiredReservationsJob>();

        return services;
    }
}

public sealed class InventoryService(IStockRepository repository) : IInventoryService
{
    public async Task<IReadOnlyList<StockDto>> GetStockAsync(
        Guid tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default)
    {
        var items = await repository.GetByVariantsAsync(TenantId.From(tenantId), variantIds, ct);
        return items.Select(i => new StockDto(i.VariantId, i.Available, i.Reserved)).ToList();
    }

    public async Task<Result<ReservationDto>> ReserveAsync(
        Guid tenantId, Guid variantId, int quantity, CancellationToken ct = default)
    {
        var result = await repository.TryReserveAsync(TenantId.From(tenantId), variantId, quantity, ct);
        if (result.IsFailure)
            return Result.Failure<ReservationDto>(result.Error);

        var r = result.Value;
        return new ReservationDto(r.Id, r.VariantId, r.Quantity, r.Status.ToString().ToUpperInvariant(), r.ExpiresAtUtc);
    }

    public Task<Result> ConfirmReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default) =>
        repository.ConfirmReservationAsync(TenantId.From(tenantId), reservationId, ct);

    public Task<Result> ReleaseReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default) =>
        repository.ReleaseReservationAsync(TenantId.From(tenantId), reservationId, ct);
}

/// <summary>
/// Libera reservas vencidas. Vive en el host Api hasta que exista el Worker
/// (anotado en checklist) — el patrón final es consumer en el host Worker.
/// </summary>
public sealed class ExpiredReservationsJob(IServiceScopeFactory scopeFactory, ILogger<ExpiredReservationsJob> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var repository = scope.ServiceProvider.GetRequiredService<IStockRepository>();
                var released = await repository.ReleaseExpiredAsync(DateTime.UtcNow, stoppingToken);
                if (released > 0)
                    logger.LogInformation("Released {Count} expired reservations", released);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Expired reservations sweep failed");
            }
        }
    }
}
