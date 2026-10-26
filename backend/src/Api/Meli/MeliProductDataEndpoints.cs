using Api.Auth;
using Identity.Infrastructure;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// Lo que la tienda sabe de un producto para Mercado Libre y no está en el catálogo (se guarda al aprobar las fichas con IA).
/// Solo lectura: no sale a Mercado Libre.
/// </summary>
public static class MeliProductDataEndpoints
{
    public static RouteGroupBuilder MapMeliProductDataEndpoints(this RouteGroupBuilder apiV1)
    {
        var meli = apiV1.MapGroup("/admin/meli/products").RequirePermission(Permission.MeliPublish);

        // La categoría guardada del producto: el flujo de publicar la trae elegida en vez de adivinarla de nuevo.
        meli.MapGet("/{productId:guid}/category", async (Guid productId, MeliDbContext db, CancellationToken ct) =>
        {
            var saved = await db.ProductCategories.AsNoTracking().FirstOrDefaultAsync(c => c.ProductId == productId, ct);
            return saved is null
                ? Results.Ok(new { categoryId = (string?)null })
                : Results.Ok(new { categoryId = (string?)saved.CategoryId, categoryName = saved.CategoryName, source = saved.Source.ToString() });
        });

        return apiV1;
    }
}
