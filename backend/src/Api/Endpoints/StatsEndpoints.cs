using System.Globalization;
using Analytics.Infrastructure;
using Api.Auth;
using Api.Notifications;
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
            ContentDbContext content, OrdersDbContext ordersDb,
            MercadoLibre.Infrastructure.MeliDbContext meli, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
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
            var (firstDay, lastDay) = OverviewDays(from, to, days);
            var since = ArgentinaTime.StartOfDayUtc(firstDay);
            var until = ArgentinaTime.StartOfDayUtc(lastDay.AddDays(1));
            var prevSince = since - (until - since);
            var span = lastDay.DayNumber - firstDay.DayNumber + 1;

            var window = await ordersDb.Orders
                .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                    && o.PaidAtUtc >= prevSince && o.PaidAtUtc < until)
                .ToListAsync(ct);

            var current = window.Where(o => o.PaidAtUtc >= since).ToList();
            var previous = window.Where(o => o.PaidAtUtc < since).ToList();

            var revenue = current.Sum(o => o.NetRevenue.AmountInMinorUnits);
            var previousRevenue = previous.Sum(o => o.NetRevenue.AmountInMinorUnits);
            var currency = current.FirstOrDefault()?.Currency
                ?? previous.FirstOrDefault()?.Currency
                ?? Money.DefaultCurrency;

            // Clientes que se sumaron a la agenda en el período (y en el anterior).
            var newCustomers = await customers.Customers
                .CountAsync(c => c.TenantId == tidGuid && c.CreatedAtUtc >= since && c.CreatedAtUtc < until, ct);
            var previousNewCustomers = await customers.Customers
                .CountAsync(c => c.TenantId == tidGuid && c.CreatedAtUtc >= prevSince && c.CreatedAtUtc < since, ct);

            // Evolución diaria del período (para el gráfico de barras), en días
            // de Argentina: una venta de las 22 h es de ese día, no del siguiente.
            var byDay = current
                .GroupBy(o => ArgentinaTime.DateOf(o.PaidAtUtc ?? o.CreatedAtUtc))
                .ToDictionary(g => g.Key, g => (Revenue: g.Sum(o => o.NetRevenue.AmountInMinorUnits), Orders: g.Count()));
            var series = Enumerable.Range(0, span)
                .Select(firstDay.AddDays)
                .Select(d => new
                {
                    date = d,
                    revenue = byDay.TryGetValue(d, out var v) ? v.Revenue : 0,
                    orders = byDay.TryGetValue(d, out var v2) ? v2.Orders : 0,
                })
                .ToList();

            // De dónde vienen las ventas: canal propio vs. Mercado Libre.
            var meliRevenue = await meli.Orders.AsNoTracking()
                .Where(o => o.TenantId == tid.Value && o.DateCreatedUtc >= since && o.DateCreatedUtc < until
                    && MercadoLibre.Infrastructure.MeliOrder.EarningStatuses.Contains(o.Status))
                .ToListAsync(ct);

            // Origen del tráfico que terminó en venta (utm_source de la orden).
            var bySource = current
                .GroupBy(o => string.IsNullOrWhiteSpace(o.UtmSource) ? "directo" : o.UtmSource!)
                .Select(g => new { source = g.Key, orders = g.Count(), revenue = g.Sum(o => o.NetRevenue.AmountInMinorUnits) })
                .OrderByDescending(x => x.revenue)
                .Take(6)
                .ToList();

            // Lo más vendido del período, por facturación.
            var topProducts = current
                .SelectMany(o => o.Items)
                .GroupBy(i => i.ProductName)
                .Select(g => new { product = g.Key, units = g.Sum(i => i.Quantity), revenue = g.Sum(i => i.LineTotal.AmountInMinorUnits) })
                .OrderByDescending(x => x.revenue)
                .Take(5)
                .ToList();

            return Results.Ok(new
            {
                days = span,
                from = firstDay,
                to = lastDay,
                currency,
                products = new { total, published, draft, archived },
                categories,
                coupons = new { total = couponsTotal, active = couponsActive },
                customers = customersCount,
                newCustomers = new { current = newCustomers, previous = previousNewCustomers },
                pages = new { total = pagesTotal, published = pagesPublished },
                sales = new
                {
                    available = true,
                    orders = current.Count,
                    revenue,
                    averageOrder = current.Count > 0 ? revenue / current.Count : 0,
                    previous = new
                    {
                        orders = previous.Count,
                        revenue = previousRevenue,
                        averageOrder = previous.Count > 0 ? previousRevenue / previous.Count : 0,
                    },
                },
                series,
                channels = new
                {
                    own = new { orders = current.Count, revenue },
                    meli = new
                    {
                        orders = meliRevenue.Count,
                        revenue = meliRevenue.Sum(o => (long)Math.Round(o.BillableAmount * 100m)),
                    },
                },
                bySource,
                topProducts,
            });
        });

        // Ventas y clientes (de Orders). Rango: from/to (fechas) o days (fallback).
        stats.MapGet("/sales", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CustomersDbContext customers, int? days, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);

            var orders = await ordersDb.Orders.Where(o => o.TenantId == tid && o.CreatedAtUtc >= since && o.CreatedAtUtc < until).ToListAsync(ct);
            var paid = orders.Where(o => OrderStatuses.Earning.Contains(o.Status)).ToList();
            var revenue = paid.Sum(o => o.NetRevenue.AmountInMinorUnits);
            var currency = paid.FirstOrDefault()?.Currency ?? orders.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;

            var series = paid
                .GroupBy(o => LocalDay(o.PaidAtUtc ?? o.CreatedAtUtc))
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
            ITenantContext tenant, OrdersDbContext ordersDb, CatalogDbContext catalog,
            int? days, int? limit, DateOnly? from, DateOnly? to, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);
            var take = Math.Clamp(limit ?? 10, 1, 50);

            var paid = await ordersDb.Orders.Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status) && o.CreatedAtUtc >= since && o.CreatedAtUtc < until).ToListAsync(ct);
            var lines = paid.SelectMany(o => o.Items).ToList();

            var ranked = lines
                .GroupBy(i => i.ProductName)
                .Select(g => new { product = g.Key, units = g.Sum(i => i.Quantity), revenue = g.Sum(i => i.LineTotal.AmountInMinorUnits) })
                .ToList();

            var top = ranked.OrderByDescending(x => x.units).Take(take).ToList();
            var topRevenue = ranked.OrderByDescending(x => x.revenue).Take(take).ToList();

            // Lo que NO se vendió es tan informativo como el top: son los
            // productos publicados que no movieron una sola unidad en el período.
            var sold = ranked.Select(x => x.product).ToHashSet();
            var published = await catalog.Products
                .Where(p => p.TenantId == tid && p.Status == ProductStatus.Active)
                .Select(p => p.Name)
                .ToListAsync(ct);
            var idle = published.Where(name => !sold.Contains(name)).OrderBy(n => n).ToList();

            return Results.Ok(new
            {
                items = top,
                byRevenue = topRevenue,
                totalUnits = lines.Sum(i => i.Quantity),
                distinctProducts = ranked.Count,
                publishedProducts = published.Count,
                idleCount = idle.Count,
                idleSample = idle.Take(12).ToList(),
            });
        });

        // Rentabilidad REAL (informe Escalafy): ganancia = ventas de productos
        // (netas de cupón) − costo snapshot de los ítems − comisión real de MP.
        // El envío cobrado se muestra aparte (pass-through al carrier, no margen).
        // Órdenes sin costo cargado quedan fuera del margen: `coverage` lo expone.
        costs.MapGet("/profitability", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CatalogDbContext catalogDb,
            MercadoLibre.Infrastructure.MeliDbContext meliDb,
            int? days, DateOnly? from, DateOnly? to, int? limit, int? offset, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 30);
            var previousSince = since - (until - since);

            var paid = await ordersDb.Orders
                .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status) && o.CreatedAtUtc >= since && o.CreatedAtUtc < until)
                .ToListAsync(ct);

            var currency = paid.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;
            long ItemsNet(Order o) => o.NetRevenue.AmountInMinorUnits - o.ShippingCost.AmountInMinorUnits;

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
                .GroupBy(o => LocalDay(o.PaidAtUtc ?? o.CreatedAtUtc))
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

            // Mismo cálculo sobre el período anterior de igual duración: el
            // margen sin contra qué compararlo no dice si vas mejorando.
            var beforePaid = await ordersDb.Orders
                .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                    && o.CreatedAtUtc >= previousSince && o.CreatedAtUtc < since)
                .ToListAsync(ct);
            var beforeWithCost = beforePaid.Where(o => o.ProductCost is not null).ToList();
            var beforeRevenueWithCost = beforeWithCost.Sum(ItemsNet);
            var beforeProfit = beforeRevenueWithCost
                - beforeWithCost.Sum(o => o.ProductCost!.Value.AmountInMinorUnits)
                - beforeWithCost.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);

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
                previous = new
                {
                    revenue = beforePaid.Sum(ItemsNet),
                    profit = beforeProfit,
                    marginPct = beforeRevenueWithCost > 0
                        ? Math.Round(beforeProfit * 100m / beforeRevenueWithCost, 1)
                        : 0m,
                },
                coverage = new { ordersWithCost = withCost.Count, ordersTotal = paid.Count },
                series,
                productsTotal = byProduct.Count,
                byProduct = byProduct
                    .Skip(Math.Max(0, offset ?? 0))
                    .Take(Math.Clamp(limit ?? 20, 1, 100))
                    .ToList(),
                byChannel,
                meli,
            });
        });

        // Reporte de cupones (uso real desde Orders + estado desde Discounts).
        stats.MapGet("/coupons", async (
            ITenantContext tenant, OrdersDbContext ordersDb, DiscountsDbContext discounts,
            int? days, DateOnly? from, DateOnly? to, int? limit, int? offset, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var (since, until) = Range(from, to, days ?? 90);
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
            var (since, until) = Range(from, to, days ?? 14);
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
            .Where(o => o.TenantId == tid.Value && MercadoLibre.Infrastructure.MeliOrder.EarningStatuses.Contains(o.Status)
                && o.DateCreatedUtc >= since && o.DateCreatedUtc < until)
            .ToListAsync(ct);
        if (meliOrders.Count == 0) return null;

        var links = await meliDb.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == tid.Value).ToListAsync(ct);
        var resolver = MercadoLibre.Infrastructure.MeliLinkResolver.From(links);
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
            // Lo cobrado, no el total de la venta: con una devolución parcial
            // cuenta lo que quedó, igual que en los ingresos del canal.
            meliRevenue += o.BillableMinorUnits;
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

    /// <summary>
    /// El día de Argentina de un instante, para las series diarias. Medianoche
    /// con Kind Utc a propósito: el JSON sale igual que antes
    /// ("2026-10-15T00:00:00Z") y el panel lee solo la parte de la fecha.
    /// </summary>
    private static DateTime LocalDay(DateTime utc) =>
        DateTime.SpecifyKind(ArgentinaTime.DateOf(utc).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);

    /// <summary>
    /// Ventana [since, until) del reporte: si viene from (y opcionalmente to),
    /// manda el rango explícito (días completos de Argentina, como el filtro
    /// del listado de ventas; tope 366); si no, los
    /// últimos `fallbackDays`. `until` exclusivo simplifica el "hasta hoy".
    /// </summary>
    /// <summary>
    /// Primer y último día (de Argentina) de la visión general: from/to si
    /// vienen, si no los últimos <paramref name="days"/> días hasta hoy. Hasta
    /// 366 días, como el resto de las estadísticas ("Este año" en un bisiesto).
    /// </summary>
    internal static (DateOnly First, DateOnly Last) OverviewDays(DateOnly? from, DateOnly? to, int? days)
    {
        var today = ArgentinaTime.Today;
        if (from is not { } f)
            return (today.AddDays(1 - Math.Clamp(days ?? 30, 1, 366)), today);

        var t = to ?? today;
        if (t < f) (f, t) = (t, f);
        if (t.DayNumber - f.DayNumber + 1 > 366) f = t.AddDays(-365);
        return (f, t);
    }

    private static (DateTime Since, DateTime Until) Range(DateOnly? from, DateOnly? to, int fallbackDays)
    {
        if (from is { } f)
        {
            var t = to ?? ArgentinaTime.Today;
            if (t < f) (f, t) = (t, f);
            var until = ArgentinaTime.StartOfDayUtc(t.AddDays(1));
            var since = ArgentinaTime.StartOfDayUtc(f);
            if ((until - since).TotalDays > 366) since = until.AddDays(-366);
            return (since, until);
        }
        return (DateTime.UtcNow.AddDays(-Math.Clamp(fallbackDays, 1, 366)), DateTime.UtcNow.AddDays(1));
    }
}
