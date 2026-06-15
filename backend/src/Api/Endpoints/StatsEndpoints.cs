using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class StatsEndpoints
{
    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder group)
    {
        var stats = group.MapGroup("/stats");

        // Métricas reales del catálogo + descuentos + clientes + páginas.
        stats.MapGet("/overview", async (
            ITenantContext tenant,
            CatalogDbContext catalog,
            DiscountsDbContext discounts,
            CustomersDbContext customers,
            ContentDbContext content,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

            var tid = tenant.TenantId;
            var tidGuid = tenant.TenantId.Value;

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

            return Results.Ok(new
            {
                products = new { total, published, draft, archived },
                categories,
                coupons = new { total = couponsTotal, active = couponsActive },
                customers = customersCount,
                pages = new { total = pagesTotal, published = pagesPublished },
                // Ventas: aún sin módulo de pedidos/checkout real.
                sales = new { available = false },
            });
        });

        return group;
    }
}
