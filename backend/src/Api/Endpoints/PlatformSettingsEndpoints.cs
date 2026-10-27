using System.Security.Claims;
using Api.Auth;
using Api.Platform;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;

namespace Api.Endpoints;

/// <summary>
/// Configuración de la plataforma (palancas de operación y credenciales de
/// servicios compartidos por todas las tiendas). Exclusivo para una cuenta con
/// <see cref="AppUser.IsSuperAdmin"/> (<c>dotnet Api.dll make-superadmin</c>).
/// </summary>
public static class PlatformSettingsEndpoints
{
    public static RouteGroupBuilder MapPlatformSettingsEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/admin/platform-settings").RequireAuthorization();

        group.AddEndpointFilter(async (ctx, next) =>
        {
            var request = ctx.HttpContext.Request;
            if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method)
                && !ctx.HttpContext.RequestServices.GetRequiredService<OriginRules>().AllowsPanelSession(request))
            {
                return Results.Problem(
                    title: "Auth.ForeignOrigin",
                    detail: "Esto solo se puede hacer desde el panel.",
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var userManager = ctx.HttpContext.RequestServices.GetRequiredService<UserManager<AppUser>>();
            var user = await userManager.GetUserAsync(ctx.HttpContext.User);
            if (user is null)
                return Results.Unauthorized();
            if (!user.IsSuperAdmin)
                return Results.Problem(
                    title: "Auth.SuperAdminRequired",
                    detail: "Esta sección es exclusiva para el superadministrador de la plataforma.",
                    statusCode: StatusCodes.Status403Forbidden);

            ctx.HttpContext.Items["SuperAdminUser"] = user;
            return await next(ctx);
        });

        group.MapGet("/", async (PlatformSettingsService service, CancellationToken ct) =>
            Results.Ok(await service.GetViewAsync(ct)));

        group.MapPut("/", async (
            UpdatePlatformSettingsRequest req,
            HttpContext http,
            PlatformSettingsService service,
            CancellationToken ct) =>
        {
            var user = http.Items["SuperAdminUser"] as AppUser;
            var (view, error) = await service.UpdateAsync(req, user?.Email, ct);
            if (error is not null)
                return Results.Problem(title: "PlatformSettings.InvalidKey", detail: error, statusCode: StatusCodes.Status400BadRequest);
            return Results.Ok(view);
        });

        return api;
    }
}

