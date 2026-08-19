using Analytics.Infrastructure;
using Api.Auth;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class StatsEndpoints
{
    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: métricas de ventas/clientes. Exige membresía.
        var stats = group.MapGroup("/stats").RequirePermission(Permission.StatsRead);

        // Resumen: catálogo + descuentos + clientes + páginas + ventas (de Orders).
        stats.MapGet("/overview", async (
            ITenantContext tenant,
            CatalogDbContext catalog, DiscountsDbContext discounts, CustomersDbContext customers,
            ContentDbContext content, OrdersDbContext ordersDb, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var tidGuid = tid.Value;

            var products = catalog.Products.Where(p => p.TenantId == tid);
            var total = await products.CountAsync(ct);
            var published = await products.CountAsync(p => p.Status == ProductStatus.Active, ct);
            var draft = await products.CountAsync(p => p.Status == ProductStatus.Draft, ct);
            var archived = await products.CountAsync(p => p.Status == ProductStatus.Archived, ct);
            var categories = await catalog.Categories.CountAsync(c => c.TenantId == tid, ct);
            var couponsTotal = await discounts.Coupons.CountAsync(c => c.TenantId == tidGuid, ct);
            var couponsActive = await discounts.Coupons.CountAsync(c => c.TenantId == tidGuid && c.Active, ct);
            var customersCount = await customers.Customers.CountAsync(c => c.TenantId == tidGuid, ct);
            var pagesTotal = await content.Pages.CountAsync(p => p.TenantId == tidGuid, ct);
            var pagesPublished = await content.Pages.CountAsync(p => p.TenantId == tidGuid && p.Published, ct);

            var paid = await ordersDb.Orders.Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid).ToListAsync(ct);
            var revenue = paid.Sum(o => o.Total.AmountInMinorUnits);
            var currency = paid.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;

            return Results.Ok(new
            {
                products = new { total, published, draft, archived },
                categories,
                coupons = new { total = couponsTotal, active = couponsActive },
                customers = customersCount,
                pages = new { total = pagesTotal, published = pagesPublished },
                sales = new { available = true, orders = paid.Count, revenue, currency },
            });
        });

        // Ventas y clientes (de Orders). Rango: from/to (fechas) o days (fallback).
        stats.MapGet("/sales", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CustomersDbContext customers, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);

            var orders = await ordersDb.Orders.Where(o => o.TenantId == tid && o.CreatedAtUtc >= since && o.CreatedAtUtc < until).ToListAsync(ct);
            var paid = orders.Where(o => o.Status == OrderStatus.Paid).ToList();
            var revenue = paid.Sum(o => o.Total.AmountInMinorUnits);
            var currency = paid.FirstOrDefault()?.Currency ?? orders.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;

            var series = paid
                .GroupBy(o => (o.PaidAtUtc ?? o.CreatedAtUtc).Date)
                .Select(g => new { date = g.Key, revenue = g.Sum(o => o.Total.AmountInMinorUnits), orders = g.Count() })
                .OrderBy(x => x.date).ToList();

            var byStatus = orders.GroupBy(o => o.Status.ToString().ToUpperInvariant())
                .Select(g => new { status = g.Key, count = g.Count() }).ToList();

            var newCustomers = await customers.Customers.CountAsync(c => c.TenantId == tid.Value && c.CreatedAtUtc >= since && c.CreatedAtUtc < until, ct);

            return Results.Ok(new
            {
                currency,
                revenue,
                orders = paid.Count,
                averageOrder = paid.Count > 0 ? revenue / paid.Count : 0,
                newCustomers,
                series,
                byStatus,
            });
        });

        // Productos más vendidos (de OrderItems de órdenes pagadas). Rango: from/to o days.
        stats.MapGet("/products/top", async (
            ITenantContext tenant, OrdersDbContext ordersDb, int? days, int? limit, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);
            var take = Math.Clamp(limit ?? 10, 1, 50);

            var paid = await ordersDb.Orders.Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid && o.CreatedAtUtc >= since && o.CreatedAtUtc < until).ToListAsync(ct);
            var top = paid.SelectMany(o => o.Items)
                .GroupBy(i => i.ProductName)
                .Select(g => new { product = g.Key, units = g.Sum(i => i.Quantity), revenue = g.Sum(i => i.LineTotal.AmountInMinorUnits) })
                .OrderByDescending(x => x.units).Take(take).ToList();

            return Results.Ok(new { items = top });
        });

        // Rentabilidad REAL (informe Escalafy): ganancia = ventas de productos
        // (netas de cupón) − costo snapshot de los ítems − comisión real de MP.
        // El envío cobrado se muestra aparte (pass-through al carrier, no margen).
        // Órdenes sin costo cargado quedan fuera del margen: `coverage` lo expone.
        stats.MapGet("/profitability", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CatalogDbContext catalogDb,
            MercadoLibre.Infrastructure.MeliDbContext meliDb,
            int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);

            var paid = await ordersDb.Orders
                .Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid && o.CreatedAtUtc >= since && o.CreatedAtUtc < until)
                .ToListAsync(ct);

            var currency = paid.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;
            long ItemsNet(Order o) => o.Total.AmountInMinorUnits - o.ShippingCost.AmountInMinorUnits;

            var withCost = paid.Where(o => o.ProductCost is not null).ToList();
            var revenue = paid.Sum(ItemsNet);
            var revenueWithCost = withCost.Sum(ItemsNet);
            var productCost = withCost.Sum(o => o.ProductCost!.Value.AmountInMinorUnits);
            var mpFees = paid.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);
            var mpFeesWithCost = withCost.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);
            var discounts = paid.Sum(o => o.DiscountAmount.AmountInMinorUnits);
            var shippingCharged = paid.Sum(o => o.ShippingCost.AmountInMinorUnits);
            var profit = revenueWithCost - productCost - mpFeesWithCost;

            var series = withCost
                .GroupBy(o => (o.PaidAtUtc ?? o.CreatedAtUtc).Date)
                .Select(g => new
                {
                    date = g.Key,
                    profit = g.Sum(o => ItemsNet(o) - o.ProductCost!.Value.AmountInMinorUnits - (o.MpFeeAmount?.AmountInMinorUnits ?? 0)),
                    revenue = g.Sum(ItemsNet),
                })
                .OrderBy(x => x.date).ToList();

            // Por canal de adquisición (utm_source de la sesión del comprador):
            // cierra el triángulo redes/campaña → tráfico → PLATA.
            var byChannel = paid
                .GroupBy(o => o.UtmSource ?? "directo")
                .Select(g =>
                {
                    var gWithCost = g.Where(o => o.ProductCost is not null).ToList();
                    return new
                    {
                        source = g.Key,
                        orders = g.Count(),
                        revenue = g.Sum(ItemsNet),
                        profit = gWithCost.Sum(o =>
                            ItemsNet(o) - o.ProductCost!.Value.AmountInMinorUnits - (o.MpFeeAmount?.AmountInMinorUnits ?? 0)),
                        ordersWithCost = gWithCost.Count,
                    };
                })
                .OrderByDescending(x => x.revenue)
                .ToList();

            // Por producto: solo ítems CON costo (margen honesto, no inventado).
            var byProduct = paid.SelectMany(o => o.Items)
                .Where(i => i.UnitCost is not null)
                .GroupBy(i => i.ProductName)
                .Select(g =>
                {
                    var rev = g.Sum(i => i.LineTotal.AmountInMinorUnits);
                    var cost = g.Sum(i => i.UnitCost!.Value.AmountInMinorUnits * i.Quantity);
                    return new
                    {
                        product = g.Key,
                        units = g.Sum(i => i.Quantity),
                        revenue = rev,
                        cost,
                        profit = rev - cost,
                        marginPct = rev > 0 ? Math.Round((rev - cost) * 100m / rev, 1) : 0m,
                    };
                })
                .OrderByDescending(x => x.profit).ToList();

            var meli = await MeliChannelProfitAsync(meliDb, catalogDb, tid, since, until, ct);

            return Results.Ok(new
            {
                currency,
                revenue,
                productCost,
                mpFees,
                discounts,
                shippingCharged,
                profit,
                marginPct = revenueWithCost > 0 ? Math.Round(profit * 100m / revenueWithCost, 1) : 0m,
                coverage = new { ordersWithCost = withCost.Count, ordersTotal = paid.Count },
                series,
                byProduct,
                byChannel,
                meli,
            });
        });

        // Reporte de cupones (uso real desde Orders + estado desde Discounts).
        stats.MapGet("/coupons", async (
            ITenantContext tenant, OrdersDbContext ordersDb, DiscountsDbContext discounts, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;

            var used = await ordersDb.Orders.Where(o => o.TenantId == tid && o.CouponCode != null).ToListAsync(ct);
            var byCoupon = used.GroupBy(o => o.CouponCode!)
                .Select(g => new
                {
                    code = g.Key,
                    uses = g.Count(),
                    paidUses = g.Count(o => o.Status == OrderStatus.Paid),
                    discountGiven = g.Where(o => o.Status == OrderStatus.Paid).Sum(o => o.DiscountAmount.AmountInMinorUnits),
                })
                .OrderByDescending(x => x.uses).ToList();

            var totalCoupons = await discounts.Coupons.CountAsync(c => c.TenantId == tid.Value, ct);
            var activeCoupons = await discounts.Coupons.CountAsync(c => c.TenantId == tid.Value && c.Active, ct);

            return Results.Ok(new
            {
                totalCoupons,
                activeCoupons,
                totalUses = byCoupon.Sum(x => x.uses),
                totalDiscount = byCoupon.Sum(x => x.discountGiven),
                items = byCoupon,
            });
        });

        // Visitas (de page_views). Rango: from/to o days.
        stats.MapGet("/visits", async (
            ITenantContext tenant, AnalyticsDbContext analytics, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tidGuid = tenant.TenantId.Value;
            var (since, until) = Range(from, to, days ?? 14);

            var views = await analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= since && v.OccurredAtUtc < until).ToListAsync(ct);
            var series = views.GroupBy(v => v.OccurredAtUtc.Date)
                .Select(g => new { date = g.Key, views = g.Count(), visitors = g.Select(x => x.VisitorId).Distinct().Count() })
                .OrderBy(x => x.date).ToList();
            var topPaths = views.GroupBy(v => v.Path)
                .Select(g => new { path = g.Key, views = g.Count() })
                .OrderByDescending(x => x.views).Take(10).ToList();
            // De dónde viene el tráfico (utm_source de los links: redes, email…).
            var topSources = views.GroupBy(v => v.UtmSource ?? "directo")
                .Select(g => new { source = g.Key, views = g.Count() })
                .OrderByDescending(x => x.views).Take(8).ToList();

            return Results.Ok(new
            {
                totalViews = views.Count,
                uniqueVisitors = views.Select(v => v.VisitorId).Distinct().Count(),
                series,
                topPaths,
                topSources,
            });
        });

        // Tiempo real (page_views de los últimos 5 minutos).
        stats.MapGet("/realtime", async (
            ITenantContext tenant, AnalyticsDbContext analytics, CancellationToken ct) =>
        {
            var tidGuid = tenant.TenantId.Value;
            var since = DateTime.UtcNow.AddMinutes(-5);

            var views = await analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= since).ToListAsync(ct);
            var recent = views.OrderByDescending(v => v.OccurredAtUtc).Take(20)
                .Select(v => new { v.Path, v.OccurredAtUtc }).ToList();
            var activePaths = views.GroupBy(v => v.Path)
                .Select(g => new { path = g.Key, visitors = g.Select(x => x.VisitorId).Distinct().Count() })
                .OrderByDescending(x => x.visitors).Take(10).ToList();

            return Results.Ok(new
            {
                activeVisitors = views.Select(v => v.VisitorId).Distinct().Count(),
                views = views.Count,
                recent,
                activePaths,
            });
        });

        // Carritos abandonados: checkouts no completados ni pagados.
        stats.MapGet("/abandoned-carts", async (
            ITenantContext tenant, CheckoutDbContext checkoutDb, OrdersDbContext ordersDb,
            int? days, int? limit, int? offset, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 90));

            var sessions = await checkoutDb.Sessions
                .Where(s => s.TenantId == tid && s.CreatedAtUtc >= since && s.Status != CheckoutStatus.Completed)
                .ToListAsync(ct);

            // Solo las ventas del MISMO período: las sesiones son de ahí, así
            // que las órdenes viejas no pueden descartar ninguna. Antes se
            // traían los ids de todas las ventas de la historia en cada
            // request — con años de operación, eso es un balde de guids.
            var paidSessionIds = (await ordersDb.Orders
                .Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid && o.CreatedAtUtc >= since)
                .Select(o => o.CheckoutSessionId).ToListAsync(ct)).ToHashSet();

            var pending = sessions
                .Where(s => !paidSessionIds.Contains(s.Id))
                .OrderByDescending(s => s.CreatedAtUtc)
                .ToList();

            var page = pending
                .Skip(Math.Max(0, offset ?? 0))
                .Take(Math.Clamp(limit ?? 50, 1, 200))
                .Select(s => new
                {
                    s.Id,
                    email = s.Email,
                    s.CreatedAtUtc,
                    items = s.Items.Count,
                    total = ApiJson.MoneyJson(s.Subtotal),
                    recoverable = s.Email != null,
                })
                .ToList();

            return Results.Ok(new
            {
                count = pending.Count,
                total = pending.Count,
                recoverableValue = pending.Where(s => s.Email != null).Sum(s => s.Subtotal.AmountInMinorUnits),
                items = page,
            });
        });

        return group;
    }

    /// <summary>
    /// Ventana [since, until) del reporte: si viene from (y opcionalmente to),
    /// manda el rango explícito (días completos UTC, tope 366); si no, los
    /// últimos `fallbackDays`. `until` exclusivo simplifica el "hasta hoy".
    /// </summary>
    /// <summary>
    /// Canal Mercado Libre del dashboard de rentabilidad: margen BRUTO (antes
    /// de la comisión de ML, que la API no persiste en el cache local) con el
    /// costo ACTUAL de las variantes vinculadas — no hay snapshot porque la
    /// venta no es nuestra. null = sin ventas ML en el rango.
    /// </summary>
    private static async Task<object?> MeliChannelProfitAsync(
        MercadoLibre.Infrastructure.MeliDbContext meliDb, CatalogDbContext catalogDb,
        TenantId tid, DateTime since, DateTime until, CancellationToken ct)
    {
        var meliOrders = await meliDb.Orders.AsNoTracking()
            .Where(o => o.TenantId == tid.Value && o.Status == "paid" && o.DateCreatedUtc >= since && o.DateCreatedUtc < until)
            .ToListAsync(ct);
        if (meliOrders.Count == 0) return null;

        var links = await meliDb.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == tid.Value).ToListAsync(ct);
        var resolver = Api.Meli.MeliLinkResolver.From(links);
        var variantIds = links.Select(l => l.VariantId).Distinct().ToList();
        var costByVariant = variantIds.Count == 0
            ? []
            : (await catalogDb.Products.AsNoTracking()
                .Where(p => p.TenantId == tid && p.Variants.Any(v => variantIds.Contains(v.Id)))
                .ToListAsync(ct))
                .SelectMany(p => p.Variants)
                .Where(v => v.Cost is not null)
                .ToDictionary(v => v.Id, v => v.Cost!.Value.AmountInMinorUnits);

        long meliRevenue = 0, meliCost = 0, meliFees = 0;
        int unitsLinked = 0, unitsTotal = 0, unitsWithFee = 0;
        foreach (var o in meliOrders)
        {
            meliRevenue += (long)Math.Round(o.TotalAmount * 100m);
            foreach (var it in Api.Meli.MeliSyncService.ParseSnapshot(o.ItemsJson))
            {
                unitsTotal += it.Quantity;
                if (it.SaleFee is { } fee)
                {
                    meliFees += (long)Math.Round(fee * it.Quantity * 100m);
                    unitsWithFee += it.Quantity;
                }
                if (resolver.TryResolve(it.ItemId, it.VariationId, out var vid)
                    && costByVariant.TryGetValue(vid, out var unitCost))
                {
                    meliCost += unitCost * it.Quantity;
                    unitsLinked += it.Quantity;
                }
            }
        }
        return new
        {
            orders = meliOrders.Count,
            revenue = meliRevenue,
            productCost = meliCost,
            // Comisión real de ML (sale_fee por ítem). Cero en snapshots
            // viejos sin el campo: unitsWithFee lo delata.
            mlFees = meliFees,
            grossProfit = meliRevenue - meliCost,
            netProfit = meliRevenue - meliCost - meliFees,
            unitsLinked,
            unitsTotal,
            unitsWithFee,
        };
    }

    private static (DateTime Since, DateTime Until) Range(DateOnly? from, DateOnly? to, int fallbackDays)
    {
        if (from is { } f)
        {
            var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            if (t < f) (f, t) = (t, f);
            var until = t.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var since = f.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            if ((until - since).TotalDays > 366) since = until.AddDays(-366);
            return (since, until);
        }
        return (DateTime.UtcNow.AddDays(-Math.Clamp(fallbackDays, 1, 366)), DateTime.UtcNow.AddDays(1));
    }
}
