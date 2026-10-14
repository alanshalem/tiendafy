using Api.Auth;
using Catalog.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Reviews.Infrastructure;
using SharedKernel.Common;

namespace Api.Reviews;

/// <summary>La venta que habilita a opinar, firmada: lo único que abre la puerta a una reseña.</summary>
public sealed record ReviewInvitePayload(Guid TenantId, Guid OrderId);

/// <summary>
/// El link para opinar (el del email y el de "Mis compras"). Lleva la venta,
/// no el producto: con él se opina de cada línea de ESA venta y de nada más.
/// Vence a los seis meses: una reseña de algo comprado hace dos años ya no
/// le sirve a nadie, y un link viejo filtrado no queda abierto para siempre.
/// </summary>
public static class ReviewInviteToken
{
    // El purpose no se toca: cambiarlo invalida los links ya mandados (ver SignedToken).
    private static readonly SignedToken<ReviewInvitePayload> Token =
        new("Tiendafy.Reviews.Invite.v1", TimeSpan.FromDays(180));

    public static string Protect(IDataProtectionProvider dp, Guid tenantId, Guid orderId) =>
        Token.Protect(dp, new ReviewInvitePayload(tenantId, orderId));

    /// <summary>El payload si el token es válido Y es de esta tienda; si no, null.</summary>
    public static ReviewInvitePayload? Unprotect(IDataProtectionProvider dp, string? token, Guid tenantId) =>
        string.IsNullOrWhiteSpace(token)
            ? null
            : Token.Unprotect(dp, token, p => p.TenantId == tenantId && p.OrderId != Guid.Empty);
}

/// <summary>Una línea de la venta, con lo que hace falta para opinar de ella.</summary>
public sealed record ReviewableLine(
    Guid OrderItemId,
    Guid VariantId,
    Guid? ProductId,
    string ProductName,
    string? ProductSlug,
    string? Image,
    string? VariantLabel,
    ProductReview? Existing);

/// <summary>La venta de una invitación y sus líneas, o por qué no se puede opinar.</summary>
public sealed record ReviewInvite(Order Order, string AuthorName, IReadOnlyList<ReviewableLine> Lines);

/// <summary>
/// Quién puede opinar y de qué. Las reglas viven acá, en un solo lugar, para
/// el link del email, el de la cuenta y el alta de la reseña:
/// <list type="bullet">
/// <item>La venta es de esta tienda y está despachada (o despachada y con una
/// devolución parcial): opinar de algo que no llegó no es una reseña.</item>
/// <item>Se opina por línea de venta, y una sola vez por línea.</item>
/// <item>El producto tiene que seguir existiendo para colgarle la reseña.</item>
/// </list>
/// </summary>
public static class ReviewEligibility
{
    public static bool OrderAllowsReviews(Order order) =>
        order.FulfilledAtUtc is not null
        && order.Status is OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded;

    public static async Task<Result<ReviewInvite>> ResolveAsync(
        Guid tenantId, Guid orderId, OrdersDbContext orders, CatalogDbContext catalog,
        ReviewsDbContext reviews, CancellationToken ct)
    {
        var order = await orders.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orderId && o.TenantId == TenantId.From(tenantId), ct);
        if (order is null)
            return Result.Failure<ReviewInvite>(Error.NotFound("Review.OrderNotFound", "No encontramos esa compra."));
        if (!OrderAllowsReviews(order))
            return Result.Failure<ReviewInvite>(Error.Conflict("Review.NotDelivered",
                "Vas a poder opinar cuando tu compra esté despachada."));

        var variantIds = order.Items.Select(i => i.VariantId).Distinct().ToList();
        var products = await catalog.Products.AsNoTracking()
            .Where(p => p.TenantId == TenantId.From(tenantId) && p.Variants.Any(v => variantIds.Contains(v.Id)))
            .ToListAsync(ct);
        var byVariant = products
            .SelectMany(p => p.Variants.Select(v => (VariantId: v.Id, Product: p)))
            .ToDictionary(x => x.VariantId, x => x.Product);

        var itemIds = order.Items.Select(i => i.Id).ToList();
        var existing = await reviews.Reviews.AsNoTracking()
            .Where(r => r.TenantId == tenantId && itemIds.Contains(r.OrderItemId))
            .ToDictionaryAsync(r => r.OrderItemId, ct);

        var lines = order.Items.Select(i =>
        {
            byVariant.TryGetValue(i.VariantId, out var product);
            return new ReviewableLine(
                i.Id,
                i.VariantId,
                product?.Id,
                i.ProductName,
                product?.Slug.Value,
                product?.Images.OrderBy(img => img.Position).FirstOrDefault()?.Url,
                string.IsNullOrWhiteSpace(i.VariantDescription) || i.VariantDescription == "Única" ? null : i.VariantDescription,
                existing.GetValueOrDefault(i.Id));
        }).ToList();

        return new ReviewInvite(order, ProductReview.DisplayName(order.BuyerName), lines);
    }
}
