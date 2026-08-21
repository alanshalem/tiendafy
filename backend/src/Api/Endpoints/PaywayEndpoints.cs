using Api.Auth;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Payments.Contracts;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public sealed record SavePaywayRequest(
    string? SiteId,
    string? Environment,
    string? PublicKey,
    /// <summary>Vacío = dejar la que ya está guardada. Nunca se devuelve al panel.</summary>
    string? PrivateKey,
    string? BaseUrlOverride,
    string? EstablishmentName,
    IReadOnlyList<int>? InstallmentOptions);

/// <summary>
/// Configuración del cobro con Payway (ex Decidir).
///
/// A diferencia de Mercado Pago, acá no hay OAuth: el comercio recibe de Payway
/// un número de comercio y un par de claves, y las carga a mano. La clave
/// privada entra por este endpoint, se cifra y no vuelve a salir nunca — el
/// panel muestra si hay una cargada, no cuál es.
/// </summary>
public static class PaywayEndpoints
{
    public static RouteGroupBuilder MapPaywayEndpoints(this RouteGroupBuilder group)
    {
        var payway = group.MapGroup("/payments/payway").RequireTenant();

        // Estado de la conexión para el panel. La clave privada NO se devuelve.
        payway.MapGet("/connection", async (
            ITenantContext tenant, PaymentsDbContext db, CancellationToken ct) =>
        {
            var connection = await db.PaywayConnections.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId, ct);

            return Results.Ok(connection is null
                ? new { connected = false }
                : (object)new
                {
                    connected = true,
                    connection.SiteId,
                    environment = connection.Environment.ToString().ToUpperInvariant(),
                    connection.PublicKey,
                    hasPrivateKey = !string.IsNullOrWhiteSpace(connection.PrivateKeyEncrypted),
                    connection.BaseUrlOverride,
                    connection.EstablishmentName,
                    installmentOptions = connection.InstallmentOptions,
                    baseUrl = connection.BaseUrl,
                    connection.IsActive,
                    connection.UpdatedAtUtc,
                });
        }).RequirePermission(Permission.PaymentsConfigRead);

        payway.MapPut("/connection", async (
            SavePaywayRequest request, ITenantContext tenant, PaymentsDbContext db,
            IPaywayCredentialProtector protector, CancellationToken ct) =>
        {
            var environment = string.Equals(request.Environment, "PRODUCTION", StringComparison.OrdinalIgnoreCase)
                ? PaywayEnvironment.Production
                : PaywayEnvironment.Sandbox;

            var encrypted = string.IsNullOrWhiteSpace(request.PrivateKey)
                ? null
                : protector.Protect(request.PrivateKey.Trim());

            var connection = await db.PaywayConnections
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId, ct);

            if (connection is null)
            {
                if (encrypted is null)
                    return Error.Validation("Payway.MissingPrivateKey", "Falta la clave privada.").ToProblem();

                var created = PaywayConnection.Create(
                    tenant.TenantId, request.SiteId, environment, request.PublicKey, encrypted);
                if (created.IsFailure) return created.Error.ToProblem();

                connection = created.Value;
                db.PaywayConnections.Add(connection);
            }

            var update = connection.Update(
                request.SiteId, environment, request.PublicKey, encrypted,
                request.BaseUrlOverride, request.EstablishmentName, request.InstallmentOptions);
            if (update.IsFailure) return update.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { connected = true, baseUrl = connection.BaseUrl });
        }).RequirePermission(Permission.PaymentsConfigWrite);

        payway.MapDelete("/connection", async (
            ITenantContext tenant, PaymentsDbContext db, CancellationToken ct) =>
        {
            var connection = await db.PaywayConnections
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId, ct);
            if (connection is null) return Results.NoContent();

            db.PaywayConnections.Remove(connection);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.PaymentsConfigWrite);

        // Prueba de credenciales contra el healthcheck de Payway. Sirve para
        // saber si el host responde antes de que falle un cobro real; no valida
        // que el comercio pueda cobrar (eso solo se sabe cobrando).
        payway.MapPost("/test", async (
            ITenantContext tenant, PaymentsDbContext db, IHttpClientFactory factory,
            CancellationToken ct) =>
        {
            var connection = await db.PaywayConnections.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId, ct);
            if (connection is null)
                return Error.Validation("Payway.NotConnected", "Cargá primero las credenciales.").ToProblem();

            using var http = factory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(8);
            try
            {
                using var response = await http.GetAsync($"{connection.BaseUrl}/healthcheck", ct);
                return Results.Ok(new { ok = response.IsSuccessStatusCode, status = (int)response.StatusCode });
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                return Results.Ok(new { ok = false, status = 0 });
            }
        }).RequirePermission(Permission.PaymentsConfigWrite);

        // Lo que el checkout del storefront necesita para tokenizar la tarjeta.
        // Público a propósito: la clave pública existe justamente para esto.
        group.MapGet("/payments/payway/public-config", async (
            ITenantContext tenant, IPaywayPaymentService payway, CancellationToken ct) =>
            Results.Ok(await payway.GetPublicConfigAsync(tenant.TenantId, ct)))
            .RequireTenant();

        return group;
    }
}
