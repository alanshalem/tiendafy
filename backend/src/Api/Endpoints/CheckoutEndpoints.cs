using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class CheckoutEndpoints
{
    public static RouteGroupBuilder MapCheckoutEndpoints(this RouteGroupBuilder group)
    {
        var checkout = group.MapGroup("/checkout");

        checkout.MapPost("/", async (
            StartCheckoutRequest request,
            ITenantContext tenant,
            StartCheckoutHandler handler,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

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
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

            var session = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            return session is null ? Results.NotFound() : Results.Ok(ToDto(session));
        });

        // Submit: reserva stock (todo o nada). El pago llega con módulo Payments.
        checkout.MapPost("/{id:guid}/submit", async (
            Guid id,
            SubmitCheckoutRequest request,
            ITenantContext tenant,
            SubmitCheckoutHandler handler,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

            var result = await handler.HandleAsync(
                new SubmitCheckoutCommand(tenant.TenantId, id, request.Email ?? string.Empty), ct);
            return result.IsSuccess ? Results.Ok(ToDto(result.Value)) : result.Error.ToProblem();
        });

        return group;
    }

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
            unitPrice = new { amount = i.UnitPrice.AmountInMinorUnits, currency = i.UnitPrice.Currency },
            lineTotal = new { amount = i.LineTotal.AmountInMinorUnits, currency = i.LineTotal.Currency },
            i.ReservationId,
        }),
        subtotal = new { amount = session.Subtotal.AmountInMinorUnits, currency = session.Subtotal.Currency },
    };
}

public sealed record StartCheckoutRequest(List<CheckoutLineInput>? Lines);

public sealed record CheckoutLineInput(Guid VariantId, int Quantity);

public sealed record SubmitCheckoutRequest(string? Email);
