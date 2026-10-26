using System.Globalization;
using Analytics.Infrastructure;
using Api.Auth;
using Api.Notifications;
using Api.Stats;
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
        // La rentabilidad muestra costos y márgenes: tiene su propio permiso.
        var costs = group.MapGroup("/stats").RequirePermission(Permission.CostsRead);
        // Los carritos abandonados son parte de Ventas, no de las estadísticas.
        var carts = group.MapGroup("/stats").RequirePermission(Permission.OrdersRead);

        // Resumen: catálogo + descuentos + clientes + páginas + ventas (de Orders).
        stats.MapGet("/overview", async (
            ITenantContext tenant,
            CatalogDbContext catalog, DiscountsDbContext discounts, CustomersDbContext customers,
            ContentDbContext content, SalesOverviewQuery salesQuery, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
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

            // Ventas del período elegido y del anterior de la misma duración:
            // un número solo no dice si el negocio viene mejor o peor. El
            // período llega como from/to (días de Argentina), igual que en el
            // resto de las estadísticas; `days` queda para quien pide "los
            // últimos N días" (el Inicio). Antes solo se leía `days`: el panel
            // mandaba la cantidad de días del período elegido y la API contaba
            // siempre hasta ahora, así que un rango personalizado mostraba otras
            // fechas y "Hoy" eran las últimas 24 horas.
            var (firstDay, lastDay) = StatsRanges.OverviewDays(from, to, days);
            var sales = await salesQuery.RunAsync(tid, firstDay, lastDay, ct);

            return Results.Ok(new
            {
                days = sales.Days,
                from = sales.FirstDay,
                to = sales.LastDay,
                currency = sales.Currency,
                products = new { total, published, draft, archived },
                categories,
                coupons = new { total = couponsTotal, active = couponsActive },
                customers = customersCount,
                newCustomers = new { current = sales.NewCustomers, previous = sales.PreviousNewCustomers },
                pages = new { total = pagesTotal, published = pagesPublished },
                sales = new
                {
                    available = true,
                    orders = sales.Current.Orders,
                    revenue = sales.Current.RevenueMinor,
                    averageOrder = sales.Current.AverageMinor,
                    previous = new
                    {
                        orders = sales.Previous.Orders,
                        revenue = sales.Previous.RevenueMinor,
                        averageOrder = sales.Previous.AverageMinor,
                    },
                },
                series = sales.Series.Select(d => new { date = d.Date, revenue = d.RevenueMinor, orders = d.Orders }).ToList(),
                channels = new
                {
                    own = new { orders = sales.Current.Orders, revenue = sales.Current.RevenueMinor },
                    meli = new { orders = sales.Meli.Orders, revenue = sales.Meli.RevenueMinor },
                },
                bySource = sales.BySource.Select(x => new { source = x.Source, orders = x.Orders, revenue = x.RevenueMinor }).ToList(),
                topProducts = sales.TopProducts.Select(x => new { product = x.Product, units = x.Units, revenue = x.RevenueMinor }).ToList(),
            });
        });

        // Ventas y clientes (de Orders). Rango: from/to (fechas) o days (fallback).
        stats.MapGet("/sales", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CustomersDbContext customers, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = StatsRanges.Range(from, to, days ?? 30);

            var orders = await ordersDb.Orders.Where(o => o.TenantId == tid && o.CreatedAtUtc >= since && o.CreatedAtUtc < until).ToListAsync(ct);
            var paid = orders.Where(o => OrderStatuses.Earning.Contains(o.Status)).ToList();
            var revenue = paid.Sum(o => o.NetRevenue.AmountInMinorUnits);
            var currency = paid.FirstOrDefault()?.Currency ?? orders.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;

            var series = paid
                .GroupBy(o => StatsRanges.LocalDay(o.PaidAtUtc ?? o.CreatedAtUtc))
                .Select(g => new { date = g.Key, revenue = g.Sum(o => o.NetRevenue.AmountInMinorUnits), orders = g.Count() })
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
            ITenantContext tenant, TopProductsQuery topQuery,
            int? days, int? limit, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = StatsRanges.Range(from, to, days ?? 30);
            var take = Math.Clamp(limit ?? 10, 1, 50);
            var result = await topQuery.RunAsync(tid, since, until, take, ct);

            return Results.Ok(new
            {
                items = result.ByUnits.Select(x => new { product = x.Product, units = x.Units, revenue = x.RevenueMinor }).ToList(),
                byRevenue = result.ByRevenue.Select(x => new { product = x.Product, units = x.Units, revenue = x.RevenueMinor }).ToList(),
                totalUnits = result.TotalUnits,
                distinctProducts = result.DistinctProducts,
                publishedProducts = result.PublishedProducts,
                idleCount = result.Idle.Count,
                idleSample = result.Idle.Take(12).ToList(),
            });
        });

        // Rentabilidad REAL (informe Escalafy): ganancia = ventas de productos
        // (netas de cupón) − costo snapshot de los ítems − comisión real de MP.
        // El envío cobrado se muestra aparte (pass-through al carrier, no margen).
        // Órdenes sin costo cargado quedan fuera del margen: `coverage` lo expone.
        costs.MapGet("/profitability", async (
            ITenantContext tenant, ProfitabilityQuery profitQuery,
            int? days, DateOnly? from, DateOnly? to, int? limit, int? offset, CancellationToken ct) =>
        {
            var (since, until) = StatsRanges.Range(from, to, days ?? 30);
            var result = await profitQuery.RunAsync(tenant.TenantId, since, until, ct);

            return Results.Ok(new
            {
                currency = result.Currency,
                revenue = result.RevenueMinor,
                productCost = result.ProductCostMinor,
                mpFees = result.MpFeesMinor,
                discounts = result.DiscountsMinor,
                shippingCharged = result.ShippingChargedMinor,
                profit = result.ProfitMinor,
                marginPct = result.MarginPct,
                previous = new
                {
                    revenue = result.Previous.RevenueMinor,
                    profit = result.Previous.ProfitMinor,
                    marginPct = result.Previous.MarginPct,
                },
                coverage = new { ordersWithCost = result.OrdersWithCost, ordersTotal = result.OrdersTotal },
                series = result.Series.Select(x => new { date = x.Date, profit = x.ProfitMinor, revenue = x.RevenueMinor }).ToList(),
                productsTotal = result.ByProduct.Count,
                byProduct = result.ByProduct
                    .Select(x => new
                    {
                        product = x.Product,
                        units = x.Units,
                        revenue = x.RevenueMinor,
                        cost = x.CostMinor,
                        profit = x.ProfitMinor,
                        marginPct = x.MarginPct,
                    })
                    .Skip(Math.Max(0, offset ?? 0))
                    .Take(Math.Clamp(limit ?? 20, 1, 100))
                    .ToList(),
                byChannel = result.ByChannel
                    .Select(x => new
                    {
                        source = x.Source,
                        orders = x.Orders,
                        revenue = x.RevenueMinor,
                        profit = x.ProfitMinor,
                        ordersWithCost = x.OrdersWithCost,
                    })
                    .ToList(),
                meli = result.Meli is { } m
                    ? new
                    {
                        orders = m.Orders,
                        revenue = m.RevenueMinor,
                        productCost = m.ProductCostMinor,
                        mlFees = m.MlFeesMinor,
                        grossProfit = m.GrossProfitMinor,
                        netProfit = m.NetProfitMinor,
                        unitsLinked = m.UnitsLinked,
                        unitsTotal = m.UnitsTotal,
                        unitsWithFee = m.UnitsWithFee,
                    }
                    : null,
            });
        });

        // Reporte de cupones (uso real desde Orders + estado desde Discounts).
        stats.MapGet("/coupons", async (
            ITenantContext tenant, OrdersDbContext ordersDb, DiscountsDbContext discounts,
            int? days, DateOnly? from, DateOnly? to, int? limit, int? offset, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = StatsRanges.Range(from, to, days ?? 90);
            var previousSince = since - (until - since);

            var window = await ordersDb.Orders
                .Where(o => o.TenantId == tid && o.CouponCode != null && o.CreatedAtUtc >= previousSince && o.CreatedAtUtc < until)
                .ToListAsync(ct);
            var used = window.Where(o => o.CreatedAtUtc >= since).ToList();
            var before = window.Where(o => o.CreatedAtUtc < since).ToList();

            var byCoupon = used.GroupBy(o => o.CouponCode!)
                .Select(g =>
                {
                    var paidOrders = g.Where(o => OrderStatuses.Earning.Contains(o.Status)).ToList();
                    var discount = paidOrders.Sum(o => o.DiscountAmount.AmountInMinorUnits);
                    // Lo que el cupón TRAJO, no solo lo que regaló: sin esto no
                    // se puede saber si un descuento valió la pena.
                    var revenue = paidOrders.Sum(o => o.NetRevenue.AmountInMinorUnits);
                    return new
                    {
                        code = g.Key,
                        uses = g.Count(),
                        paidUses = paidOrders.Count,
                        discountGiven = discount,
                        revenue,
                        netRevenue = revenue - discount,
                    };
                })
                .OrderByDescending(x => x.revenue)
                .ToList();

            var totalCoupons = await discounts.Coupons.CountAsync(c => c.TenantId == tid.Value, ct);
            var activeCoupons = await discounts.Coupons.CountAsync(c => c.TenantId == tid.Value && c.Active, ct);
            var previousPaid = before.Where(o => OrderStatuses.Earning.Contains(o.Status)).ToList();

            return Results.Ok(new
            {
                totalCoupons,
                activeCoupons,
                totalUses = byCoupon.Sum(x => x.uses),
                totalDiscount = byCoupon.Sum(x => x.discountGiven),
                totalRevenue = byCoupon.Sum(x => x.revenue),
                previous = new
                {
                    totalUses = before.Count,
                    totalDiscount = previousPaid.Sum(o => o.DiscountAmount.AmountInMinorUnits),
                    totalRevenue = previousPaid.Sum(o => o.NetRevenue.AmountInMinorUnits),
                },
                total = byCoupon.Count,
                items = byCoupon
                    .Skip(Math.Max(0, offset ?? 0))
                    .Take(Math.Clamp(limit ?? 20, 1, 100))
                    .ToList(),
            });
        });

        // Visitas (de page_views). Rango: from/to o days.
        stats.MapGet("/visits", async (
            ITenantContext tenant, AnalyticsDbContext analytics, OrdersDbContext ordersDb,
            int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var tidGuid = tid.Value;
            var (since, until) = StatsRanges.Range(from, to, days ?? 14);
            var previousSince = since - (until - since);

            // Todo se cuenta en la base: una tienda con tráfico real tiene
            // decenas de miles de vistas por período y traerlas para contarlas
            // en memoria es pedirle al servidor que se caiga solo.
            var period = analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= since && v.OccurredAtUtc < until);

            var totalViews = await period.CountAsync(ct);
            var uniqueVisitors = await period.Select(v => v.VisitorId).Distinct().CountAsync(ct);

            // Por día de Argentina, contado en la base: correr el instante al
            // huso local antes de truncar al día (Npgsql lo traduce a
            // date_trunc('day', occurred_at_utc + interval, 'UTC')). La fecha
            // sale con el mismo formato de siempre, medianoche "UTC".
            var offset = ArgentinaTime.Offset;
            var series = (await period
                    .GroupBy(v => (v.OccurredAtUtc + offset).Date)
                    .Select(g => new { date = g.Key, views = g.Count(), visitors = g.Select(x => x.VisitorId).Distinct().Count() })
                    .ToListAsync(ct))
                .OrderBy(x => x.date)
                .ToList();

            var topPaths = await period
                .GroupBy(v => v.Path)
                .Select(g => new { path = g.Key, views = g.Count() })
                .OrderByDescending(x => x.views)
                .Take(10)
                .ToListAsync(ct);

            // De dónde viene el tráfico (utm_source de los links: redes, email…).
            var topSources = await period
                .GroupBy(v => v.UtmSource ?? "directo")
                .Select(g => new { source = g.Key, views = g.Count() })
                .OrderByDescending(x => x.views)
                .Take(8)
                .ToListAsync(ct);

            var previous = analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= previousSince && v.OccurredAtUtc < since);
            var previousViews = await previous.CountAsync(ct);
            var previousVisitors = await previous.Select(v => v.VisitorId).Distinct().CountAsync(ct);

            // Conversión: de cada 100 visitantes distintos, cuántos compraron.
            // Es la métrica que convierte "tuve mucha visita" en "sirvió".
            var ordersInPeriod = await ordersDb.Orders
                .CountAsync(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                    && o.PaidAtUtc >= since && o.PaidAtUtc < until, ct);
            var previousOrders = await ordersDb.Orders
                .CountAsync(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                    && o.PaidAtUtc >= previousSince && o.PaidAtUtc < since, ct);

            static decimal Rate(int orders, int visitors) =>
                visitors > 0 ? Math.Round(orders * 100m / visitors, 2) : 0m;

            return Results.Ok(new
            {
                totalViews,
                uniqueVisitors,
                orders = ordersInPeriod,
                conversionPct = Rate(ordersInPeriod, uniqueVisitors),
                previous = new
                {
                    totalViews = previousViews,
                    uniqueVisitors = previousVisitors,
                    orders = previousOrders,
                    conversionPct = Rate(previousOrders, previousVisitors),
                },
                series,
                topPaths,
                topSources,
            });
        });

        // Tiempo real (page_views de los últimos 5 minutos).
        stats.MapGet("/realtime", async (
            ITenantContext tenant, AnalyticsDbContext analytics, OrdersDbContext ordersDb, CancellationToken ct) =>
        {
            var tidGuid = tenant.TenantId.Value;
            var since = DateTime.UtcNow.AddMinutes(-5);

            var views = await analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= since).ToListAsync(ct);
            var recent = views.OrderByDescending(v => v.OccurredAtUtc).Take(20)
                .Select(v => new { v.Path, v.OccurredAtUtc }).ToList();
            var activePaths = views.GroupBy(v => v.Path)
                .Select(g => new { path = g.Key, visitors = g.Select(x => x.VisitorId).Distinct().Count() })
                .OrderByDescending(x => x.visitors).Take(10).ToList();

            // Pulso de la última hora, minuto a minuto: un número de "ahora"
            // no dice si la tienda se está despertando o apagando.
            var hourAgo = DateTime.UtcNow.AddMinutes(-60);
            var lastHour = await analytics.PageViews
                .Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= hourAgo)
                .GroupBy(v => new { v.OccurredAtUtc.Hour, v.OccurredAtUtc.Minute })
                .Select(g => new { g.Key.Hour, g.Key.Minute, views = g.Count() })
                .ToListAsync(ct);
            var pulse = Enumerable.Range(0, 60)
                .Select(i => hourAgo.AddMinutes(i))
                .Select(t => new
                {
                    // La etiqueta, en hora argentina (el panel la muestra tal cual).
                    minute = ArgentinaTime.ToLocal(t).ToString("HH:mm", CultureInfo.InvariantCulture),
                    views = lastHour.FirstOrDefault(x => x.Hour == t.Hour && x.Minute == t.Minute)?.views ?? 0,
                })
                .ToList();

            // Lo de hoy contra lo de ayer a esta misma hora: la comparación que
            // sirve cuando el día todavía no terminó.
            // "Hoy" es el día de Argentina: arranca a las 3 UTC, no a las 21 h locales.
            var startOfToday = ArgentinaTime.StartOfDayUtc(ArgentinaTime.Today);
            var elapsed = DateTime.UtcNow - startOfToday;
            var today = await ordersDb.Orders
                .Where(o => o.TenantId == tenant.TenantId && OrderStatuses.Earning.Contains(o.Status) && o.PaidAtUtc >= startOfToday)
                .ToListAsync(ct);
            var yesterday = await ordersDb.Orders
                .Where(o => o.TenantId == tenant.TenantId && OrderStatuses.Earning.Contains(o.Status)
                    && o.PaidAtUtc >= startOfToday.AddDays(-1) && o.PaidAtUtc < startOfToday.AddDays(-1) + elapsed)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                activeVisitors = views.Select(v => v.VisitorId).Distinct().Count(),
                views = views.Count,
                recent,
                activePaths,
                pulse,
                today = new
                {
                    orders = today.Count,
                    revenue = today.Sum(o => o.NetRevenue.AmountInMinorUnits),
                    currency = today.FirstOrDefault()?.Currency ?? Money.DefaultCurrency,
                },
                yesterdaySoFar = new
                {
                    orders = yesterday.Count,
                    revenue = yesterday.Sum(o => o.NetRevenue.AmountInMinorUnits),
                },
            });
        });

        // Carritos abandonados: checkouts no completados que no terminaron en
        // una compra, uno por comprador (el mismo criterio que el recordatorio,
        // ver AbandonedCarts).
        carts.MapGet("/abandoned-carts", async (
            ITenantContext tenant, CheckoutDbContext checkoutDb, OrdersDbContext ordersDb,
            int? days, int? limit, int? offset, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 90));

            var sessions = await checkoutDb.Sessions
                .Where(s => s.TenantId == tid && s.CreatedAtUtc >= since && s.Status != CheckoutStatus.Completed)
                .ToListAsync(ct);

            var outcomes = await AbandonedCarts.ClassifyAsync(sessions, checkoutDb, ordersDb, ct);
            var pending = sessions
                .Where(s => outcomes[s.Id] == AbandonedCarts.Outcome.Abandoned)
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
}
