using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using SharedKernel.Abstractions;
using Api.Auth;

namespace Api.Endpoints;

public static class CheckoutEndpoints
{
    public static RouteGroupBuilder MapCheckoutEndpoints(this RouteGroupBuilder group)
    {
        var checkout = group.MapGroup("/checkout").RequireTenant();

        checkout.MapPost("/", async (
            StartCheckoutRequest request,
            ITenantContext tenant,
            StartCheckoutHandler handler,
            CancellationToken ct) =>
        {
            var command = new StartCheckoutCommand(
                tenant.TenantId,
                request.Lines?.Select(l => new StartCheckoutLine(l.VariantId, l.Quantity)).ToList() ?? []);

            var result = await handler.HandleAsync(command, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/checkout/{result.Value.Id}", ToDto(result.Value))
                : result.Error.ToProblem();
        });

        checkout.MapGet("/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            ICheckoutRepository repository,
            CancellationToken ct) =>
        {
            var session = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            return session is null ? Results.NotFound() : Results.Ok(ToDto(session));
        });

        // Submit: reserva stock (todo o nada) + datos de entrega/facturación.
        // El costo de envío se resuelve server-side desde el método persistido.
        checkout.MapPost("/{id:guid}/submit", async (
            Guid id,
            SubmitCheckoutRequest request,
            ITenantContext tenant,
            SubmitCheckoutHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(new SubmitCheckoutCommand(
                tenant.TenantId, id, request.Email ?? string.Empty,
                request.Name, request.LastName, request.Phone, request.DocNumber, request.Notes,
                request.ShippingMethodId, request.Address), ct);
            return result.IsSuccess ? Results.Ok(ToDto(result.Value)) : result.Error.ToProblem();
        });

        // Medios de envío visibles al comprador (activos).
        group.MapGet("/shipping/methods", async (
            ITenantContext tenant, IShippingMethodRepository repository, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var items = await repository.ListAsync(tenant.TenantId, onlyActive: true, ct);
            return Results.Ok(new { items = items.Select(ShippingDto) });
        });

        return group;
    }

    internal static object ShippingDto(ShippingMethod m) => new
    {
        m.Id,
        m.Name,
        kind = m.Kind.ToString().ToUpperInvariant(),
        price = ApiJson.MoneyJson(m.Price),
        m.Description,
        m.PickupAddress,
        m.Active,
        m.SortOrder,
    };

    private static object ToDto(CheckoutSession session) => new
    {
        session.Id,
        status = session.Status.ToString().ToUpperInvariant(),
        session.Email,
        session.Currency,
        session.ExpiresAtUtc,
        items = session.Items.Select(i => new
        {
            i.VariantId,
            i.ProductName,
            i.VariantDescription,
            i.Sku,
            i.Quantity,
            unitPrice = ApiJson.MoneyJson(i.UnitPrice),
            lineTotal = ApiJson.MoneyJson(i.LineTotal),
            i.ReservationId,
        }),
        subtotal = ApiJson.MoneyJson(session.Subtotal),
        shipping = ApiJson.MoneyJson(session.ShippingCost),
        shippingMethod = session.ShippingMethodName,
        shippingAddress = session.ShippingAddress,
    };
}

public sealed record StartCheckoutRequest(List<CheckoutLineInput>? Lines);

public sealed record CheckoutLineInput(Guid VariantId, int Quantity);

public sealed record SubmitCheckoutRequest(
    string? Email,
    string? Name = null,
    string? LastName = null,
    string? Phone = null,
    string? DocNumber = null,
    string? Notes = null,
    Guid? ShippingMethodId = null,
    string? Address = null);
