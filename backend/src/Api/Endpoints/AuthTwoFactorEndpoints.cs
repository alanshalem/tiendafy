using System.Security.Claims;
using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

namespace Api.Endpoints;

/// <summary>
/// Verificación en dos pasos del panel: el segundo paso del login y lo que la
/// persona activa, desactiva o renueva desde "Mi cuenta". Es de cada persona
/// (no de una tienda): no lleva X-Tenant-Id ni permisos de la matriz.
///
/// <para>
/// El login con contraseña de alguien que la tiene activa no abre sesión:
/// deja la cookie intermedia de Identity (<c>tiendafy.2fa</c>, 5 minutos) y
/// responde <c>{ twoFactorRequired: true }</c>. Con esa cookie y un código de
/// la app (o uno de recuperación) <c>POST /auth/login/2fa</c> abre la sesión.
/// Cada código mal puesto cuenta como un intento fallido, igual que una
/// contraseña mal puesta: al quinto, la cuenta se bloquea unos minutos.
/// </para>
/// </summary>
public static class AuthTwoFactorEndpoints
{
    private const string InternalLoginProvider = "[AspNetUserStore]";

    public static RouteGroupBuilder MapTwoFactorEndpoints(this RouteGroupBuilder auth)
    {
        // Segundo paso del login: el código de la app o uno de recuperación.
        auth.MapPost("/login/2fa", async (
            TwoFactorLoginRequest req,
            HttpContext http,
            SignInManager<AppUser> signInManager,
            UserManager<AppUser> userManager,
            PanelTwoFactor twoFactor) =>
        {
            var user = await signInManager.GetTwoFactorAuthenticationUserAsync();
            if (user is null || !user.TwoFactorEnabled)
                return Results.Problem(title: "Auth.TwoFactorExpired",
                    detail: "Pasó demasiado tiempo. Volvé a ingresar tu contraseña.", statusCode: 401);

            if (await userManager.IsLockedOutAsync(user))
                return LockedOut();

            if (await twoFactor.VerifyAsync(user, req.Code) == SecondFactor.None)
            {
                await userManager.AccessFailedAsync(user);
                return await userManager.IsLockedOutAsync(user)
                    ? LockedOut()
                    : Results.Problem(title: "Auth.InvalidCode",
                        detail: "El código no es correcto o ya venció. Probá con el que muestra ahora la app.", statusCode: 401);
            }

            await userManager.ResetAccessFailedCountAsync(user);
            await http.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
            await signInManager.SignInWithClaimsAsync(user, isPersistent: true, [new Claim("amr", "mfa")]);
            return Results.Ok(AuthEndpoints.ToDto(user));
        }).RequireRateLimiting("auth");

        var manage = auth.MapGroup("/2fa").RequireAuthorization();

        manage.MapGet("/", async (ClaimsPrincipal principal, UserManager<AppUser> userManager) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            return Results.Ok(new
            {
                enabled = user.TwoFactorEnabled,
                recoveryCodesLeft = user.TwoFactorEnabled ? await userManager.CountRecoveryCodesAsync(user) : 0,
            });
        });

        // Empezar a activarla: una clave nueva para la app (la anterior, si
        // había una a medio configurar, deja de servir). Se confirma con /enable.
        manage.MapPost("/setup", async (
            ClaimsPrincipal principal, UserManager<AppUser> userManager, SignInManager<AppUser> signInManager) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (user.TwoFactorEnabled) return AlreadyEnabled();

            await userManager.ResetAuthenticatorKeyAsync(user);
            // Cambiar la clave cambia el sello de seguridad: sin renovar la
            // cookie, esta misma sesión se cerraría en la próxima validación.
            await signInManager.RefreshSignInAsync(user);
            var key = await userManager.GetAuthenticatorKeyAsync(user) ?? string.Empty;
            var uri = PanelTwoFactor.AuthenticatorUri(user.Email ?? user.UserName ?? string.Empty, key);
            return Results.Ok(new
            {
                sharedKey = PanelTwoFactor.FormatKey(key),
                authenticatorUri = uri,
                qrSvg = Api.Import.VariantLabelsPdf.QrSvg(uri),
            });
        }).RequireRateLimiting("auth");

        // Confirmar con un código de la app: queda activa y se entregan los
        // códigos de recuperación (se muestran esta única vez).
        manage.MapPost("/enable", async (
            TwoFactorCodeRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (user.TwoFactorEnabled) return AlreadyEnabled();
            if (await userManager.GetAuthenticatorKeyAsync(user) is null)
                return Results.Problem(title: "Auth.TwoFactorNotStarted",
                    detail: "Empezá de nuevo: tocá \"Activar\" para ver el código QR.", statusCode: 409);

            if (!await twoFactor.VerifyAuthenticatorCodeAsync(user, req.Code))
                return InvalidCode();

            await userManager.SetTwoFactorEnabledAsync(user, true);
            var codes = await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, PanelTwoFactor.RecoveryCodeCount);
            await signInManager.RefreshSignInAsync(user);
            return Results.Ok(new { recoveryCodes = codes });
        }).RequireRateLimiting("auth");

        // Desactivarla pide la contraseña o un código (de la app o de recuperación).
        manage.MapPost("/disable", async (
            TwoFactorConfirmRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (!user.TwoFactorEnabled) return Results.NoContent(); // idempotente
            if (await ConfirmAsync(user, req, userManager, twoFactor) is { } denied) return denied;

            await userManager.SetTwoFactorEnabledAsync(user, false);
            // Fuera la clave y los códigos: activarla de nuevo arranca de cero.
            await userManager.RemoveAuthenticationTokenAsync(user, InternalLoginProvider, "AuthenticatorKey");
            await userManager.RemoveAuthenticationTokenAsync(user, InternalLoginProvider, "RecoveryCodes");
            await signInManager.RefreshSignInAsync(user);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        // Códigos de recuperación nuevos (los anteriores dejan de servir).
        manage.MapPost("/recovery-codes", async (
            TwoFactorConfirmRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (!user.TwoFactorEnabled)
                return Results.Problem(title: "Auth.TwoFactorDisabled",
                    detail: "La verificación en dos pasos no está activa.", statusCode: 409);
            if (await ConfirmAsync(user, req, userManager, twoFactor) is { } denied) return denied;

            var codes = await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, PanelTwoFactor.RecoveryCodeCount);
            await signInManager.RefreshSignInAsync(user);
            return Results.Ok(new { recoveryCodes = codes });
        }).RequireRateLimiting("auth");

        return auth;
    }

    /// <summary>
    /// Confirma que es la persona (contraseña o código) antes de algo que
    /// debilita o renueva el segundo factor. Los fallos cuentan para el bloqueo
    /// por intentos, como en el login: una sesión robada no sirve para adivinar.
    /// Null = confirmado.
    /// </summary>
    private static async Task<IResult?> ConfirmAsync(
        AppUser user, TwoFactorConfirmRequest req, UserManager<AppUser> userManager, PanelTwoFactor twoFactor)
    {
        if (string.IsNullOrEmpty(req.Password) && string.IsNullOrWhiteSpace(req.Code))
            return Results.Problem(title: "Auth.ConfirmationRequired",
                detail: "Escribí tu contraseña o un código de la app para confirmar.", statusCode: 400);
        if (await userManager.IsLockedOutAsync(user)) return LockedOut();

        var ok = !string.IsNullOrEmpty(req.Password)
            ? await userManager.CheckPasswordAsync(user, req.Password)
            : await twoFactor.VerifyAsync(user, req.Code) != SecondFactor.None;
        if (ok)
        {
            await userManager.ResetAccessFailedCountAsync(user);
            return null;
        }

        await userManager.AccessFailedAsync(user);
        if (await userManager.IsLockedOutAsync(user)) return LockedOut();
        return !string.IsNullOrEmpty(req.Password)
            ? Results.Problem(title: "Auth.InvalidPassword", detail: "La contraseña no es correcta.", statusCode: 400)
            : InvalidCode();
    }

    private static IResult InvalidCode() =>
        Results.Problem(title: "Auth.InvalidCode",
            detail: "El código no es correcto o ya venció. Probá con el que muestra ahora la app.", statusCode: 400);

    private static IResult AlreadyEnabled() =>
        Results.Problem(title: "Auth.TwoFactorAlreadyEnabled",
            detail: "La verificación en dos pasos ya está activa.", statusCode: 409);

    private static IResult LockedOut() =>
        Results.Problem(title: "Auth.LockedOut",
            detail: "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.", statusCode: 429);
}

public sealed record TwoFactorLoginRequest(string? Code);
public sealed record TwoFactorCodeRequest(string? Code);
public sealed record TwoFactorConfirmRequest(string? Password = null, string? Code = null);
