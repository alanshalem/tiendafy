using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;

namespace Api.Middleware;

/// <summary>
/// Las sesiones del panel abiertas sin la verificación en dos pasos por
/// alguien a quien se le exige (<see cref="TwoFactorRequirement"/>): una de
/// antes de que se exigiera, o de alguien que pasó a ser dueño o administrador
/// con la sesión abierta. Todo pedido a la API responde 403
/// <c>Auth.TwoFactorSetupRequired</c> y el panel lleva a configurarla.
///
/// <para>
/// Quedan afuera los de <c>/auth/</c>: son de la persona y no de una tienda
/// (<c>/auth/me</c>, salir, y configurar la verificación, que es justamente lo
/// que tiene que poder hacer). El resto de <c>/auth/</c> (login, contraseña
/// olvidada…) no usa la sesión.
/// </para>
/// </summary>
public sealed class TwoFactorSetupMiddleware(RequestDelegate next)
{
    private const string ExemptPrefix = "/api/v1/auth/";

    public async Task InvokeAsync(HttpContext ctx, TwoFactorRequirement requirement)
    {
        var path = ctx.Request.Path.Value ?? string.Empty;
        if (requirement.Enabled
            && path.StartsWith("/api/v1/", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWith(ExemptPrefix, StringComparison.OrdinalIgnoreCase)
            && ctx.User.GetUserId() is { } userId)
        {
            // Mismo DbContext que el endpoint: el usuario queda cargado para él.
            var users = ctx.RequestServices.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByIdAsync(userId.ToString()) is { } user
                && await requirement.MissingAsync(user, ctx.RequestAborted))
            {
                await TwoFactorRequirement.SetupRequired().ExecuteAsync(ctx);
                return;
            }
        }

        await next(ctx);
    }
}
