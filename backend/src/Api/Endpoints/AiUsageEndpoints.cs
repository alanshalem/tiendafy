using System.Globalization;
using Api.Ai;
using Api.Auth;
using Identity.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Consumo de IA del mes, de esta tienda o de todas las propias. Mismo permiso que la
/// configuración (<see cref="Permission.AiConfig"/>): es del dueño.
/// </summary>
public static class AiUsageEndpoints
{
    public static RouteGroupBuilder MapAiUsageEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/ai/config/usage", async (
            HttpContext http, ITenantContext tenant, AiUsageQueries queries, TimeProvider clock,
            CancellationToken ct, string? month = null, string? scope = null) =>
        {
            var anyDay = ArgentinaTime.DateOf(clock.GetUtcNow().UtcDateTime);
            if (month is not null
                && !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out anyDay))
                return Error.Validation("Ai.UsageMonth", "El mes tiene que ser como 2026-10.").ToProblem();

            switch ((scope ?? "store").ToLowerInvariant())
            {
                case "store":
                    return Results.Ok(await queries.StoreAsync(tenant.TenantId.Value, anyDay, ct));
                case "owned":
                    var userId = http.User.GetUserId();
                    return userId is null
                        ? AuthExtensions.NotAMember()
                        : Results.Ok(await queries.OwnedAsync(userId.Value, anyDay, ct));
                default:
                    return Error.Validation("Ai.UsageScope", "El alcance tiene que ser store u owned.").ToProblem();
            }
        }).RequireTenant().RequirePermission(Permission.AiConfig);

        return group;
    }
}
