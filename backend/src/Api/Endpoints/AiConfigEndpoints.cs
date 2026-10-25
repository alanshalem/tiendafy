using Api.Ai;
using Api.Auth;
using Identity.Infrastructure;
using SharedKernel.Common;

namespace Api.Endpoints;

public sealed record AiKeyRequest(string? ApiKey);

public sealed record AiAssignmentsRequest(List<AiAssignmentItem>? Items);

public sealed record AiSettingsRequest(bool Enabled, decimal MonthlyBudgetUsd, int AlertThresholdPct);

/// <summary>
/// Configuración de IA de la tienda: claves de los proveedores, modelo por tarea y tope mensual.
/// Solo el dueño (<see cref="Permission.AiConfig"/>). Ninguna respuesta lleva una clave.
/// </summary>
public static class AiConfigEndpoints
{
    public static RouteGroupBuilder MapAiConfigEndpoints(this RouteGroupBuilder group)
    {
        var config = group.MapGroup("/ai/config").RequireTenant().RequirePermission(Permission.AiConfig);

        config.MapGet("/", async (AiConfigService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(ct)));

        config.MapPut("/providers/{provider}", async (string provider, AiKeyRequest request, AiConfigService service, CancellationToken ct) =>
        {
            if (!AiConfigService.TryParseProvider(provider, out var parsed)) return UnknownProvider();
            var result = await service.SaveKeyAsync(parsed, request.ApiKey, ct);
            return result.IsFailure ? result.Error.ToProblem() : Results.NoContent();
        });

        config.MapDelete("/providers/{provider}", async (string provider, AiConfigService service, CancellationToken ct) =>
        {
            if (!AiConfigService.TryParseProvider(provider, out var parsed)) return UnknownProvider();
            await service.DeleteKeyAsync(parsed, ct);
            return Results.NoContent();
        });

        // Gasta tokens de verdad: va con el cupo por usuario, después de los permisos.
        config.MapPost("/providers/{provider}/test", async (string provider, AiConfigService service, CancellationToken ct) =>
        {
            if (!AiConfigService.TryParseProvider(provider, out var parsed)) return UnknownProvider();
            var result = await service.TestKeyAsync(parsed, ct);
            return result.IsFailure ? result.Error.ToProblem() : Results.Ok(result.Value);
        }).RequireAiRateLimit(AiRateLimitKind.PerUser);

        config.MapPut("/assignments", async (AiAssignmentsRequest request, AiConfigService service, CancellationToken ct) =>
        {
            var result = await service.SaveAssignmentsAsync(request.Items, ct);
            return result.IsFailure ? result.Error.ToProblem() : Results.NoContent();
        });

        config.MapPut("/settings", async (AiSettingsRequest request, AiConfigService service, CancellationToken ct) =>
        {
            var result = await service.SaveSettingsAsync(request.Enabled, request.MonthlyBudgetUsd, request.AlertThresholdPct, ct);
            return result.IsFailure ? result.Error.ToProblem() : Results.NoContent();
        });

        // Escribe en otras tiendas: solo hacia las del dueño, todo o nada.
        config.MapPost("/copy", async (AiCopyRequest request, HttpContext http, IMembershipService memberships,
            AiConfigService service, CancellationToken ct) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return AuthExtensions.NotAMember();
            var owned = (await memberships.OwnedTenantIdsAsync(userId.Value, ct)).ToHashSet();
            var result = await service.CopyAsync(owned, request, ct);
            if (result.IsSuccess) return Results.Ok(new AiCopyResult(result.Value));
            return result.Error.Code == AiConfigService.CopyForbiddenCode ? AuthExtensions.NotAMember() : result.Error.ToProblem();
        });

        return group;
    }

    private static IResult UnknownProvider() =>
        Error.NotFound("Ai.UnknownProvider", "Ese proveedor de inteligencia artificial no existe.").ToProblem();
}
