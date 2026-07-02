using Analytics.Infrastructure;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Api.Auth;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class StatsEndpoints
{
    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: métricas de ventas/clientes. Exige membresía.
        var stats = group.MapGroup("/stats").RequireTenantMembership();

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

        // Ventas y clientes (de Orders).
        stats.MapGet("/sales", async (
            ITenantContext tenant, OrdersDbContext ordersDb, CustomersDbContext customers, int? days, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 365));

            var orders = await ordersDb.Orders.Where(o => o.TenantId == tid && o.CreatedAtUtc >= since).ToListAsync(ct);
            var paid = orders.Where(o => o.Status == OrderStatus.Paid).ToList();
            var revenue = paid.Sum(o => o.Total.AmountInMinorUnits);
            var currency = paid.FirstOrDefault()?.Currency ?? orders.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;

            var series = paid
                .GroupBy(o => (o.PaidAtUtc ?? o.CreatedAtUtc).Date)
                .Select(g => new { date = g.Key, revenue = g.Sum(o => o.Total.AmountInMinorUnits), orders = g.Count() })
                .OrderBy(x => x.date).ToList();

            var byStatus = orders.GroupBy(o => o.Status.ToString().ToUpperInvariant())
                .Select(g => new { status = g.Key, count = g.Count() }).ToList();

            var newCustomers = await customers.Customers.CountAsync(c => c.TenantId == tid.Value && c.CreatedAtUtc >= since, ct);

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

        // Productos más vendidos (de OrderItems de órdenes pagadas).
        stats.MapGet("/products/top", async (
            ITenantContext tenant, OrdersDbContext ordersDb, int? days, int? limit, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 365));
            var take = Math.Clamp(limit ?? 10, 1, 50);

            var paid = await ordersDb.Orders.Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid && o.CreatedAtUtc >= since).ToListAsync(ct);
            var top = paid.SelectMany(o => o.Items)
                .GroupBy(i => i.ProductName)
                .Select(g => new { product = g.Key, units = g.Sum(i => i.Quantity), revenue = g.Sum(i => i.LineTotal.AmountInMinorUnits) })
                .OrderByDescending(x => x.units).Take(take).ToList();

            return Results.Ok(new { items = top });
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

        // Visitas (de page_views).
        stats.MapGet("/visits", async (
            ITenantContext tenant, AnalyticsDbContext analytics, int? days, CancellationToken ct) =>
        {
            var tidGuid = tenant.TenantId.Value;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 14, 1, 90));

            var views = await analytics.PageViews.Where(v => v.TenantId == tidGuid && v.OccurredAtUtc >= since).ToListAsync(ct);
            var series = views.GroupBy(v => v.OccurredAtUtc.Date)
                .Select(g => new { date = g.Key, views = g.Count(), visitors = g.Select(x => x.VisitorId).Distinct().Count() })
                .OrderBy(x => x.date).ToList();
            var topPaths = views.GroupBy(v => v.Path)
                .Select(g => new { path = g.Key, views = g.Count() })
                .OrderByDescending(x => x.views).Take(10).ToList();

            return Results.Ok(new
            {
                totalViews = views.Count,
                uniqueVisitors = views.Select(v => v.VisitorId).Distinct().Count(),
                series,
                topPaths,
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
            ITenantContext tenant, CheckoutDbContext checkoutDb, OrdersDbContext ordersDb, int? days, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 90));

            var sessions = await checkoutDb.Sessions
                .Where(s => s.TenantId == tid && s.CreatedAtUtc >= since && s.Status != CheckoutStatus.Completed)
                .ToListAsync(ct);

            var paidSessionIds = (await ordersDb.Orders
                .Where(o => o.TenantId == tid && o.Status == OrderStatus.Paid)
                .Select(o => o.CheckoutSessionId).ToListAsync(ct)).ToHashSet();

            var abandoned = sessions
                .Where(s => !paidSessionIds.Contains(s.Id))
                .OrderByDescending(s => s.CreatedAtUtc)
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
                count = abandoned.Count,
                recoverableValue = sessions.Where(s => !paidSessionIds.Contains(s.Id) && s.Email != null).Sum(s => s.Subtotal.AmountInMinorUnits),
                items = abandoned,
            });
        });

        return group;
    }

}
