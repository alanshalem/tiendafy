using Api.Auth;
using Api.Shipping;
using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Abstractions;
using SharedKernel.Common;

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
        // El costo de envío se resuelve server-side: método persistido, o quote
        // de Correo Argentino firmado por el servidor (nunca del cliente).
        checkout.MapPost("/{id:guid}/submit", async (
            Guid id,
            SubmitCheckoutRequest request,
            ITenantContext tenant,
            SubmitCheckoutHandler handler,
            IDataProtectionProvider dp,
            ICorreoArgentinoConfigRepository correoConfigs,
            CorreoSecretProtector protector,
            MiCorreoClient correoClient,
            CancellationToken ct) =>
        {
            QuotedShipping? quote = null;
            if (!string.IsNullOrEmpty(request.ShippingQuoteToken))
            {
                var payload = CorreoQuoteToken.Unprotect(dp, request.ShippingQuoteToken, tenant.TenantId.Value);
                if (payload is null)
                    return Error.Validation("Checkout.QuoteExpired",
                        "La cotización de envío venció. Volvé a calcular el envío.").ToProblem();

                var price = new Money(payload.PriceMinorUnits, payload.Currency);
                if (payload.Kind == "S")
                {
                    if (string.IsNullOrWhiteSpace(request.CorreoAgency))
                        return Error.Validation("Checkout.MissingAgency",
                            "Elegí la sucursal de Correo donde retirar.").ToProblem();
                    var agencyLabel = await ResolveAgencyLabelAsync(
                        tenant.TenantId.Value, request.CorreoAgency.Trim(), correoConfigs, protector, correoClient, ct);
                    quote = new QuotedShipping(payload.ServiceName, price, RequiresAddress: false, agencyLabel, payload.Units);
                }
                else
                {
                    quote = new QuotedShipping(payload.ServiceName, price, RequiresAddress: true, null, payload.Units);
                }
            }

            var result = await handler.HandleAsync(new SubmitCheckoutCommand(
                tenant.TenantId, id, request.Email ?? string.Empty,
                request.Name, request.LastName, request.Phone, request.DocNumber, request.Notes,
                request.ShippingMethodId, request.Address, quote), ct);
            return result.IsSuccess ? Results.Ok(ToDto(result.Value)) : result.Error.ToProblem();
        });

        // Medios de envío visibles al comprador (activos) + si la tienda cotiza
        // en vivo con Correo Argentino (el storefront muestra el bloque de CP).
        group.MapGet("/shipping/methods", async (
            ITenantContext tenant, IShippingMethodRepository repository,
            ICorreoArgentinoConfigRepository correoConfigs, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var items = await repository.ListAsync(tenant.TenantId, onlyActive: true, ct);
            var correo = await correoConfigs.GetAsync(tenant.TenantId.Value, ct);
            return Results.Ok(new
            {
                items = items.Select(ShippingDto),
                correoArgentino = new
                {
                    enabled = correo?.Active == true && (correo.OfferHomeDelivery || correo.OfferAgencyDelivery),
                    agency = correo?.Active == true && correo.OfferAgencyDelivery,
                },
            });
        });

        return group;
    }

    /// <summary>
    /// "Sucursal Correo Argentino Monte Grande (B0107) — Vicente López 448".
    /// Se resuelve server-side desde el listado cacheado (el cliente solo manda
    /// el código); si la API no responde, cae al código pelado.
    /// </summary>
    private static async Task<string> ResolveAgencyLabelAsync(
        Guid tenantId, string agencyCode, ICorreoArgentinoConfigRepository configs,
        CorreoSecretProtector protector, MiCorreoClient client, CancellationToken ct)
    {
        var fallback = $"Sucursal Correo Argentino {agencyCode}";
        var config = await configs.GetAsync(tenantId, ct);
        if (config is null || agencyCode.Length < 2 || !char.IsAsciiLetter(agencyCode[0])) return fallback;
        try
        {
            var agencies = await client.GetAgenciesAsync(
                CorreoArgentinoEndpoints.Credentials(config, protector), config.CustomerId,
                char.ToUpperInvariant(agencyCode[0]).ToString(), ct);
            var agency = agencies.FirstOrDefault(a =>
                string.Equals(a.Code, agencyCode, StringComparison.OrdinalIgnoreCase));
            if (agency is null) return fallback;
            var addr = agency.Location?.Address;
            var street = addr is null ? null : $"{addr.StreetName} {addr.StreetNumber}".Trim();
            return string.IsNullOrWhiteSpace(street)
                ? $"Sucursal Correo Argentino {agency.Name} ({agency.Code})"
                : $"Sucursal Correo Argentino {agency.Name} ({agency.Code}) — {street}, {addr!.Locality ?? addr.City}";
        }
        catch (MiCorreoException)
        {
            return fallback;
        }
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
    string? Address = null,
    string? ShippingQuoteToken = null,
    string? CorreoAgency = null);
