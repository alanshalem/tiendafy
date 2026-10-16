using Api.Auth;
using Api.Storefront;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class InventoryEndpoints
{
    public static RouteGroupBuilder MapInventoryEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: stock/ledger. Exige membresía.
        // El stock se ve en la ficha ("quedan 2", "sin stock"): un ajuste tiene que llegar a la tienda.
        var inventory = group.MapGroup("/inventory").RequirePermission(Permission.InventoryRead).RequirePermissionForWrites(Permission.InventoryWrite)
            .RevalidatesStorefront(StorefrontScope.Catalog);

        // Stock por lista de variantes: /inventory?variantIds=a,b,c
        inventory.MapGet("/", async (
            string variantIds,
            ITenantContext tenant,
            IStockRepository repository,
            CancellationToken ct) =>
        {
            var ids = variantIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.TryParse(s.Trim(), out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty)
                .ToList();

            var items = await repository.GetByVariantsAsync(tenant.TenantId, ids, ct);
            return Results.Ok(new
            {
                items = items.Select(s => new { s.VariantId, s.Available, s.Reserved, s.Location }),
            });
        });

        // Resumen del depósito: lo que la tabla de stock no contesta de un vistazo
        // — cuántas unidades hay, cuánta plata inmovilizan y qué está en cero o
        // por agotarse. Solo proyecta dos columnas por variante: el costo está
        // serializado en texto, así que la valorización se suma en memoria sí o sí.
        inventory.MapGet("/summary", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalog,
            Inventory.Infrastructure.Persistence.InventoryDbContext inventoryDb,
            int? lowStockThreshold, CancellationToken ct) =>
        {
            var low = Math.Clamp(lowStockThreshold ?? 5, 1, 100);

            var variants = await catalog.Products.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId)
                .SelectMany(p => p.Variants)
                .Select(v => new { v.Id, v.Cost })
                .ToListAsync(ct);

            var stock = await inventoryDb.StockItems.AsNoTracking()
                .Select(s => new { s.VariantId, s.Available, s.Reserved })
                .ToListAsync(ct);
            var available = stock
                .GroupBy(s => s.VariantId)
                .ToDictionary(g => g.Key, g => g.Sum(s => s.Available));

            var units = 0;
            var outOfStock = 0;
            var lowStock = 0;
            long stockValue = 0;
            var currency = SharedKernel.Common.Money.DefaultCurrency;

            foreach (var v in variants)
            {
                var qty = available.GetValueOrDefault(v.Id, 0);
                units += qty;
                if (qty <= 0) outOfStock++;
                else if (qty <= low) lowStock++;

                // Valorización A COSTO, no a precio de venta: es la plata parada
                // en el depósito, no lo que se espera facturar por ella.
                if (v.Cost is { } cost)
                {
                    stockValue += cost.AmountInMinorUnits * Math.Max(0, qty);
                    currency = cost.Currency;
                }
            }

            return Results.Ok(new
            {
                variants = variants.Count,
                units,
                outOfStock,
                lowStock,
                reserved = stock.Sum(s => s.Reserved),
                stockValueMinor = stockValue,
                currency,
                withoutCost = variants.Count(v => v.Cost is null),
            });
        });

        // Ubicación física (bin) de la variante en el depósito.
        inventory.MapPut("/{variantId:guid}/location", async (
            Guid variantId, SetLocationRequest request, ITenantContext tenant,
            IStockRepository repository, CancellationToken ct) =>
        {
            if (request.Location is { Length: > 60 })
                return SharedKernel.Common.Error.Validation(
                    "Inventory.InvalidLocation", "La ubicación admite hasta 60 caracteres.").ToProblem();
            await repository.SetLocationAsync(tenant.TenantId, variantId, request.Location, ct);
            return Results.NoContent();
        });

        // Ajuste manual del merchant (alta inicial o corrección).
        inventory.MapPut("/{variantId:guid}", async (
            Guid variantId,
            SetStockRequest request,
            ITenantContext tenant,
            IStockRepository repository,
            CancellationToken ct) =>
        {
            if (request.Available < 0)
                return Results.Problem(title: "Stock.Negative", detail: "Available cannot be negative.", statusCode: 400);

            // Con ExpectedAvailable (lo que la pantalla mostraba al cargar), el
            // ajuste no pisa una venta o una recepción que entró mientras se
            // editaba: responde 409 con el stock actual. Sin él, set absoluto
            // como siempre (conteo de depósito, escáner, importación).
            if (request.ExpectedAvailable is { } expected)
            {
                var result = await repository.SetAvailableIfUnchangedAsync(
                    tenant.TenantId, variantId, expected, request.Available, request.Reason, ct);
                return result.IsSuccess
                    ? Results.Ok(new { result.Value.VariantId, result.Value.Available, result.Value.Reserved })
                    : result.Error.ToProblem();
            }

            var item = await repository.SetAvailableAsync(
                tenant.TenantId, variantId, request.Available, request.Reason, ct);
            return Results.Ok(new { item.VariantId, item.Available, item.Reserved });
        });

        // Ledger de movimientos por variante (auditoría del merchant): el
        // historial de stock de Inventario. Las reservas y las ventas cobradas
        // no traen motivo; se cruzan con la venta que las hizo (la línea de la
        // orden guarda su reserva) para que el historial diga "venta #1043" y
        // no un "Reservado" suelto que nadie puede rastrear.
        inventory.MapGet("/{variantId:guid}/ledger", async (
            Guid variantId, ITenantContext tenant, IStockRepository repository,
            OrdersDbContext ordersDb, CancellationToken ct) =>
        {
            var movements = await repository.GetLedgerAsync(tenant.TenantId, variantId, LedgerSize, ct);

            var reservationIds = movements.Where(m => m.ReservationId is not null)
                .Select(m => m.ReservationId).Distinct().ToList();
            List<LedgerOrder> lines = reservationIds.Count == 0
                ? []
                : await ordersDb.Orders.AsNoTracking()
                    .Where(o => o.TenantId == tenant.TenantId)
                    .SelectMany(o => o.Items.Where(i => reservationIds.Contains(i.ReservationId)),
                        (o, i) => new LedgerOrder(i.ReservationId, o.Id, o.Number))
                    .ToListAsync(ct);
            var orderByReservation = lines
                .GroupBy(x => x.ReservationId!.Value)
                .ToDictionary(g => g.Key, g => g.First());

            return Results.Ok(new
            {
                items = movements.Select(m =>
                {
                    var order = m.ReservationId is { } rid ? orderByReservation.GetValueOrDefault(rid) : null;
                    return new
                    {
                        type = m.Type.ToString(),
                        m.Quantity,
                        m.Reason,
                        m.OccurredAtUtc,
                        orderId = order?.OrderId,
                        orderNumber = order is { Number: > 0 } ? order.Number : (int?)null,
                    };
                }),
                // El historial muestra los últimos movimientos, no todos: la
                // pantalla lo aclara cuando llega al tope.
                limit = LedgerSize,
            });
        });

        return group;
    }

    /// <summary>Cuántos movimientos trae el historial de una variante (los más nuevos).</summary>
    private const int LedgerSize = 50;

    /// <summary>La venta que reservó (y después cobró) un movimiento de stock.</summary>
    private sealed record LedgerOrder(Guid? ReservationId, Guid OrderId, int Number);
}

public sealed record SetStockRequest(int Available, string? Reason, int? ExpectedAvailable = null);

public sealed record SetLocationRequest(string? Location);
