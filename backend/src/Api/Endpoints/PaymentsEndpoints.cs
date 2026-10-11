using Api.Auth;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Payments.Core.Domain;
using Payments.Core.Features.Connect;
using Payments.Infrastructure.MercadoPago;
using Payments.Infrastructure.Persistence;
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

            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            return Results.Ok(ToDto(connection));
        }).RequirePermission(Permission.PaymentsConfigRead);

        // Config pública para el storefront: modo de cobro + public key (no secreto).
        mp.MapGet("/public-config", async (
            ITenantContext tenant, IMercadoPagoConnectionRepository repository, CancellationToken ct) =>
        {
            var c = await repository.GetByTenantAsync(tenant.TenantId, ct);
            return Results.Ok(new
            {
                connected = c is not null,
                checkoutMode = (c?.CheckoutMode ?? MercadoPagoCheckoutMode.Pro).ToString().ToUpperInvariant(),
                publicKey = c?.PublicKey,
            });
        }).RequireTenant();

        // Arranca el OAuth: devuelve la URL a la que el front manda al merchant.
        mp.MapPost("/connect", (ITenantContext tenant, BuildConnectUrlHandler handler) =>
        {

            return Results.Ok(new { authUrl = handler.Handle(tenant.TenantId) });
        }).RequirePermission(Permission.PaymentsConfigWrite);

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

            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            if (connection is null) return Results.NoContent();

            await repository.RemoveAsync(connection, ct);
            await repository.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.PaymentsConfigWrite);

        // Preferencias de cobro: modo Pro/API, comisión de plataforma, descriptor.
        mp.MapPut("/preferences", async (
            UpdatePaymentPreferencesRequest request,
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            CancellationToken ct) =>
        {

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
        }).RequirePermission(Permission.PaymentsConfigWrite);

        // Salud del inbox de webhooks.
        //
        // Un webhook que agota los reintentos queda "dead" y nadie se entera:
        // el comprador pagó, la orden sigue pendiente y no falla nada. Esto lo
        // pone a la vista, como ya lo hace el panel de Mercado Libre.
        //
        // El evento no tiene tienda (se resuelve al procesarlo), así que se
        // acota por el user_id de Mercado Pago de ESTA tienda: sin conexión no
        // hay nada que mostrar, y nunca se ven los eventos de otra.
        mp.MapGet("/webhooks/health", async (
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            PaymentsDbContext db,
            CancellationToken ct) =>
        {
            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            if (connection is null)
                return Results.Ok(new { connected = false, pending = 0, stuck = 0, last = (DateTime?)null, stuckEvents = Array.Empty<object>() });

            var mine = db.PaymentWebhookEvents.AsNoTracking().Where(e => e.UserId == connection.MercadoPagoUserId);

            var counts = await mine
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    pending = g.Count(e => e.Status == InboxEntry.StatusPending),
                    stuck = g.Count(e => e.Status == InboxEntry.StatusDead),
                    last = (DateTime?)g.Max(e => e.CreatedAtUtc),
                })
                .FirstOrDefaultAsync(ct);

            var stuckEvents = await mine
                .Where(e => e.Status == InboxEntry.StatusDead)
                .OrderByDescending(e => e.CreatedAtUtc)
                .Take(20)
                .Select(e => new { id = e.Id, e.DataId, e.Attempts, e.LastError, e.CreatedAtUtc })
                .ToListAsync(ct);

            return Results.Ok(new
            {
                connected = true,
                pending = counts?.pending ?? 0,
                stuck = counts?.stuck ?? 0,
                last = counts?.last,
                stuckEvents,
            });
        }).RequirePermission(Permission.PaymentsConfigRead);

        // Devolver a la cola un webhook que se dio por muerto. Es la salida
        // cuando lo que fallaba ya se arregló: sin esto, recuperar una venta
        // cobrada y no registrada es entrar a la base a mano.
        mp.MapPost("/webhooks/{id:guid}/retry", async (
            Guid id,
            ITenantContext tenant,
            IMercadoPagoConnectionRepository repository,
            PaymentsDbContext db,
            CancellationToken ct) =>
        {
            var connection = await repository.GetByTenantAsync(tenant.TenantId, ct);
            if (connection is null)
                return Error.Conflict("MercadoPago.NotConnected", "No hay una cuenta de Mercado Pago conectada.").ToProblem();

            // El acote por user_id es lo que impide revivir el evento de otra tienda.
            var ev = await db.PaymentWebhookEvents
                .FirstOrDefaultAsync(e => e.Id == id && e.UserId == connection.MercadoPagoUserId, ct);
            if (ev is null) return Results.NotFound();

            if (!ev.Revive())
                return Error.Conflict("Webhook.NotDead", "Ese webhook no está dado por perdido.").ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.PaymentsConfigWrite);

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
