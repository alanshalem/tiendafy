using Api.Auth;
using Microsoft.Extensions.Options;
using Payments.Core.Domain;
using Payments.Core.Features.Connect;
using Payments.Infrastructure.MercadoPago;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class PaymentsEndpoints
{
    public static RouteGroupBuilder MapPaymentsEndpoints(this RouteGroupBuilder group)
    {
        var mp = group.MapGroup("/payments/mercadopago");

        // Estado de la conexión (lo consume el panel de Pagos del admin).
        mp.MapGet("/connection", async (
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return AuthExtensions.MissingTenant();

            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            return Results.Ok(ToDto(connection));
        }).RequireTenantMembership(); // estado de conexión MP = solo admin (public-config es público aparte)

        // Config pública para el storefront: modo de cobro + public key (no secreto).
        mp.MapGet("/public-config", async (
            ITenantContext tenant, IMercadoPagoConnectionRepository repository, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var c = await repository.GetByTenantAsync(tenant.TenantId, ct);
            return Results.Ok(new
            {
                connected = c is not null,
                checkoutMode = (c?.CheckoutMode ?? MercadoPagoCheckoutMode.Pro).ToString().ToUpperInvariant(),
                publicKey = c?.PublicKey,
            });
        });

        // Arranca el OAuth: devuelve la URL a la que el front manda al merchant.
        mp.MapPost("/connect", (ITenantContext tenant, BuildConnectUrlHandler handler) =>
        {
            if (!tenant.HasTenant)
                return AuthExtensions.MissingTenant();

            return Results.Ok(new { authUrl = handler.Handle(tenant.TenantId) });
        });

        // Callback OAuth (lo invoca el navegador del merchant tras autorizar en MP).
        // Sin tenant header: el tenant viaja firmado en el `state`.
        mp.MapGet("/callback", async (
            string? code,
            string? state,
            OAuthCallbackHandler handler,
            IOptions<MercadoPagoOptions> options,
            CancellationToken ct) =>
        {
            var returnUrl = options.Value.AdminReturnUrl;
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Results.Redirect($"{returnUrl}?mp=error");

            var result = await handler.HandleAsync(code, state, ct);
            return Results.Redirect($"{returnUrl}?mp={(result.IsSuccess ? "connected" : "error")}");
        });

        // Desconectar la cuenta.
        mp.MapDelete("/connection", async (
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return AuthExtensions.MissingTenant();

            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            if (connection is null) return Results.NoContent();

            await repository.RemoveAsync(connection, ct);
            await repository.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Preferencias de cobro: modo Pro/API, comisión de plataforma, descriptor.
        mp.MapPut("/preferences", async (
            UpdatePaymentPreferencesRequest request,
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return AuthExtensions.MissingTenant();

            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            if (connection is null)
                return Error.Conflict("MercadoPago.NotConnected",
                    "Conectá tu cuenta de MercadoPago antes de configurar el cobro.").ToProblem();

            if (!string.IsNullOrWhiteSpace(request.CheckoutMode)
                && Enum.TryParse<MercadoPagoCheckoutMode>(request.CheckoutMode, ignoreCase: true, out var mode))
                connection.SetCheckoutMode(mode);

            if (request.MarketplaceFeePercent is { } fee)
                connection.SetMarketplaceFee(fee);

            connection.SetStatementDescriptor(request.StatementDescriptor);

            await repository.SaveChangesAsync(ct);
            return Results.Ok(ToDto(connection));
        });

        return group;
    }

    private static object ToDto(MercadoPagoConnection? connection) => new
    {
        connected = connection is not null,
        userId = connection?.MercadoPagoUserId,
        checkoutMode = (connection?.CheckoutMode ?? MercadoPagoCheckoutMode.Pro).ToString().ToUpperInvariant(),
        marketplaceFeePercent = connection?.MarketplaceFeePercent ?? 0m,
        statementDescriptor = connection?.StatementDescriptor,
        tokenExpiresAtUtc = connection?.TokenExpiresAtUtc,
        connectedAtUtc = connection?.ConnectedAtUtc,
    };
}

public sealed record UpdatePaymentPreferencesRequest(
    string? CheckoutMode,
    decimal? MarketplaceFeePercent,
    string? StatementDescriptor);
