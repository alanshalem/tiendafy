using Api.Shop;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>Favoritos del comprador logueado (persisten en DB). Bearer del shopper.</summary>
public static class ShopFavoritesEndpoints
{
    public static RouteGroupBuilder MapShopFavoritesEndpoints(this RouteGroupBuilder group)
    {
        // No hay GET: la tienda lee los favoritos de la cuenta con el merge (con
        // la lista del navegador, vacía o no), que devuelve el set unificado.
        var fav = group.MapGroup("/shop/favorites");

        fav.MapPut("/{productId:guid}", async (Guid productId, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var exists = await db.CustomerFavorites.AnyAsync(f => f.CustomerId == customer.Id && f.ProductId == productId, ct);
            if (!exists)
            {
                db.CustomerFavorites.Add(CustomerFavorite.Create(customer.Id, customer.TenantId, productId));
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        fav.MapDelete("/{productId:guid}", async (Guid productId, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            await db.CustomerFavorites.Where(f => f.CustomerId == customer.Id && f.ProductId == productId).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });

        // Merge: al loguearse, el invitado sube sus favoritos locales. Devuelve el set unificado.
        fav.MapPost("/merge", async (MergeFavoritesRequest req, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var existing = (await db.CustomerFavorites.Where(f => f.CustomerId == customer.Id).Select(f => f.ProductId).ToListAsync(ct)).ToHashSet();
            foreach (var pid in req.ProductIds ?? [])
                if (Guid.TryParse(pid, out var g) && existing.Add(g))
                    db.CustomerFavorites.Add(CustomerFavorite.Create(customer.Id, customer.TenantId, g));
            await db.SaveChangesAsync(ct);
            var ids = await FavoriteIdsAsync(db, customer.Id, ct);
            return Results.Ok(new { productIds = ids });
        });

        return group;
    }
    private static Task<List<Guid>> FavoriteIdsAsync(CustomersDbContext db, Guid customerId, CancellationToken ct) =>
        db.CustomerFavorites.AsNoTracking()
            .Where(f => f.CustomerId == customerId)
            .OrderByDescending(f => f.CreatedAtUtc)
            .Select(f => f.ProductId).ToListAsync(ct);

}

public sealed record MergeFavoritesRequest(string[] ProductIds);
