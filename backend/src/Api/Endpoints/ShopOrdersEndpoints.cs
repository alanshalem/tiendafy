using Api.Auth;
using Api.Shop;
using Customers.Infrastructure;
using Orders.Core.Domain;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>"Mis pedidos" del comprador logueado (bearer del shopper).</summary>
public static class ShopOrdersEndpoints
{
    public static RouteGroupBuilder MapShopOrdersEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/shop/orders", async (HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null || string.IsNullOrEmpty(customer.Email)) return Results.Unauthorized();

            var list = await orders.ListByBuyerEmailAsync(tenant.TenantId, customer.Email, ct);
            return Results.Ok(new
            {
                items = list.Select(o => new
                {
                    o.Id,
                    status = o.Status.ToString().ToUpperInvariant(),
                    o.Currency,
                    o.CreatedAtUtc,
                    o.PaidAtUtc,
                    o.Tracking,
                    total = ApiJson.MoneyJson(o.Total),
                    items = o.Items.Select(i => new
                    {
                        i.ProductName,
                        i.VariantDescription,
                        i.Quantity,
                        unitPrice = ApiJson.MoneyJson(i.UnitPrice),
                    }),
                }),
            });
        });

        return group;
    }
}
