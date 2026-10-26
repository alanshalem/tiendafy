using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>
/// "Actualizar la ficha en ML": manda los atributos de un producto a sus publicaciones vinculadas. Es la única escritura hacia Mercado
/// Libre de las fichas con IA y va con su propio clic (y su propio permiso): aprobar una ficha no toca la publicación.
///
/// <para>
/// Un <c>PUT /items/{id}</c> por publicación (no por variación: dos vínculos de la misma publicación son un solo pedido), solo con
/// <c>attributes</c>: ni la categoría, que ML no deja cambiar con ventas, ni el <c>SELLER_SKU</c>, que es de la variación. Los
/// atributos son los mismos que se mandan al publicar (<see cref="MeliListingPayload.Attributes"/>), así que lo que la tienda
/// tiene manda sobre lo guardado. Cada pedido pasa por <see cref="MeliTenantGate"/>.
/// </para>
/// </summary>
/// <remarks>
/// Sin confirmar con una cuenta real: si ML trata el <c>attributes</c> de un PUT como reemplazo de la lista entera o como un cambio de
/// solo los ids enviados (la documentación, con ejemplos que mandan un subconjunto, apunta a lo segundo).
/// </remarks>
public sealed class MeliListingAttributesPush(
    MeliDbContext db,
    CatalogDbContext catalog,
    IProductRepository products,
    MeliTokenService tokens,
    MeliClient client,
    MeliTenantGate gate)
{
    public static readonly Error DemoIsReadOnly = Error.Conflict("Meli.Demo",
        "Es una cuenta de demostración: no se puede escribir en Mercado Libre. Conectá una cuenta real.");

    public static readonly Error NotConnected = Error.Conflict("Meli.NotConnected", "Conectá tu cuenta de Mercado Libre primero.");

    private static readonly Error NotLinked = Error.Validation("Meli.NotLinked", "Este producto no está publicado en Mercado Libre.");

    /// <summary>La conexión de la tienda lista para escribir, o por qué no (demostración, sin conectar). Sin salir a Mercado Libre.</summary>
    public async Task<Result<string>> TokenAsync(TenantId tenantId, CancellationToken ct)
    {
        var connection = await db.Connections.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId.Value, ct);
        if (connection is null) return Result.Failure<string>(NotConnected);
        if (connection.IsDemo) return Result.Failure<string>(DemoIsReadOnly);

        var token = await tokens.GetValidTokenAsync(tenantId.Value, ct);
        return token is null ? Result.Failure<string>(NotConnected) : token;
    }

    /// <summary>Cuántas publicaciones se actualizaron. <see cref="MeliBusyException"/> sale tal cual: Mercado Libre está limitando.</summary>
    public async Task<Result<int>> PushAsync(TenantId tenantId, Guid productId, CancellationToken ct)
    {
        var token = await TokenAsync(tenantId, ct);
        if (token.IsFailure) return Result.Failure<int>(token.Error);
        return await PushAsync(tenantId, productId, token.Value, ct);
    }

    /// <summary>Igual que el anterior con el token ya resuelto: el lote lo pide una sola vez.</summary>
    public async Task<Result<int>> PushAsync(TenantId tenantId, Guid productId, string token, CancellationToken ct)
    {
        var itemIds = await db.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == tenantId.Value && l.ProductId == productId)
            .Select(l => l.MeliItemId).Distinct().ToListAsync(ct);
        if (itemIds.Count == 0) return Result.Failure<int>(NotLinked);

        var product = await products.GetByIdAsync(tenantId, productId, ct);
        if (product is null)
            return Result.Failure<int>(Error.NotFound("Meli.ProductNotFound", "Ese producto no existe."));

        var specAttributeIds = product.Specs.Count > 0
            ? await catalog.SpecDefinitions.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.MeliAttributeId != null)
                .Select(d => new { d.Id, d.MeliAttributeId })
                .ToDictionaryAsync(d => d.Id, d => d.MeliAttributeId!, ct)
            : [];
        var saved = await db.ProductAttributes.AsNoTracking()
            .Where(a => a.TenantId == tenantId.Value && a.ProductId == productId).ToListAsync(ct);
        var attributes = MeliListingPayload.Attributes(product, sellerSku: null, specAttributeIds, saved);
        if (attributes.Count == 0)
            return Result.Failure<int>(Error.Validation("Meli.NoAttributes", "Este producto no tiene datos para mandar a Mercado Libre."));

        foreach (var itemId in itemIds)
        {
            try
            {
                await gate.RunAsync(tenantId.Value, async cancel =>
                {
                    using var _ = await client.PutAsync(token, $"/items/{itemId}", new { attributes }, cancel);
                    return true;
                }, ct);
            }
            catch (MeliException ex)
            {
                return Result.Failure<int>(Error.Validation("Meli.UpdateFailed", ex.Message));
            }
        }
        return itemIds.Count;
    }
}
