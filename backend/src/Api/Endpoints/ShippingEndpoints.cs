using Api.Auth;
using Checkout.Core.Domain;
using Identity.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>CRUD de medios de envío de la tienda (admin). La lectura pública
/// para el comprador vive en /shipping/methods (CheckoutEndpoints).</summary>
public static class ShippingEndpoints
{
    public static RouteGroupBuilder MapShippingEndpoints(this RouteGroupBuilder group)
    {
        var admin = group.MapGroup("/admin/shipping/methods").RequirePermission(Permission.ShippingConfig);

        admin.MapGet("/", async (ITenantContext tenant, IShippingMethodRepository repository, CancellationToken ct) =>
        {
            var items = await repository.ListAsync(tenant.TenantId, onlyActive: false, ct);
            return Results.Ok(new { items = items.Select(CheckoutEndpoints.ShippingDto) });
        });

        admin.MapPost("/", async (
            ShippingMethodRequest req, ITenantContext tenant, IShippingMethodRepository repository, CancellationToken ct) =>
        {
            var result = ShippingMethod.Create(
                tenant.TenantId, req.Name ?? string.Empty, ParseKind(req.Kind),
                Money.FromDecimal(req.Price ?? 0m, Money.DefaultCurrency),
                req.Description, req.PickupAddress, req.SortOrder ?? 0);
            if (result.IsFailure) return result.Error.ToProblem();

            await repository.AddAsync(result.Value, ct);
            await repository.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/admin/shipping/methods/{result.Value.Id}",
                CheckoutEndpoints.ShippingDto(result.Value));
        });

        admin.MapPut("/{id:guid}", async (
            Guid id, ShippingMethodRequest req, ITenantContext tenant, IShippingMethodRepository repository, CancellationToken ct) =>
        {
            var method = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (method is null) return Results.NotFound();

            var result = method.Update(
                req.Name ?? string.Empty, ParseKind(req.Kind),
                Money.FromDecimal(req.Price ?? 0m, Money.DefaultCurrency),
                req.Description, req.PickupAddress, req.Active ?? true, req.SortOrder ?? method.SortOrder);
            if (result.IsFailure) return result.Error.ToProblem();

            await repository.SaveChangesAsync(ct);
            return Results.Ok(CheckoutEndpoints.ShippingDto(method));
        });

        admin.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, IShippingMethodRepository repository, CancellationToken ct) =>
        {
            var method = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (method is null) return Results.NoContent();
            await repository.RemoveAsync(method, ct);
            await repository.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static ShippingKind ParseKind(string? kind) =>
        string.Equals(kind, "PICKUP", StringComparison.OrdinalIgnoreCase)
            ? ShippingKind.Pickup
            : ShippingKind.Delivery;
}

public sealed record ShippingMethodRequest(
    string? Name,
    string? Kind,
    decimal? Price,
    string? Description,
    string? PickupAddress,
    bool? Active,
    int? SortOrder);
