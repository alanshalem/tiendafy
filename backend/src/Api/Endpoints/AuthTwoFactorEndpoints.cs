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
///
/// <para>
/// Dueños y administradores, si la plataforma la exige
/// (<see cref="TwoFactorRequirement"/>): el login sin ella deja la misma cookie
/// intermedia marcada "para configurar" (15 minutos) y responde
/// <c>{ twoFactorSetupRequired: true }</c>. Con esa cookie solo andan
/// <c>GET /2fa</c>, <c>/2fa/setup</c> y <c>/2fa/enable</c>; al activarla se
/// abre la sesión. No la pueden desactivar: sí renovar los códigos o pasarla
/// a otra app (<c>/2fa/relink</c>). Si pierden todo, quien opera la
/// plataforma la borra con <c>dotnet Api.dll reset-2fa</c> (<see cref="PanelTwoFactorReset"/>).
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
            PanelTwoFactor twoFactor,
            TwoFactorRequirement requirement) =>
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
            return Results.Ok(AuthEndpoints.ToDto(user, await requirement.AppliesToAsync(user.Id)));
        }).RequireRateLimiting("auth");

        // Ver el estado, empezar y confirmar: con la sesión o con el paso
        // intermedio de quien tiene que configurarla para entrar (ver
        // ResolveAsync). Lo demás del grupo pide la sesión.
        var setupGroup = auth.MapGroup("/2fa");
        var manage = auth.MapGroup("/2fa").RequireAuthorization();

        setupGroup.MapGet("/", async (HttpContext http, UserManager<AppUser> userManager) =>
        {
            var (user, _) = await ResolveAsync(http, userManager);
            if (user is null) return NoSessionNorSetupStep();
            return Results.Ok(new
            {
                enabled = user.TwoFactorEnabled,
                recoveryCodesLeft = user.TwoFactorEnabled ? await userManager.CountRecoveryCodesAsync(user) : 0,
            });
        });

        // Empezar a activarla: una clave nueva para la app (la anterior, si
        // había una a medio configurar, deja de servir). Se confirma con /enable.
        setupGroup.MapPost("/setup", async (
            HttpContext http, UserManager<AppUser> userManager, SignInManager<AppUser> signInManager) =>
        {
            var (user, pending) = await ResolveAsync(http, userManager);
            if (user is null) return NoSessionNorSetupStep();
            if (user.TwoFactorEnabled) return AlreadyEnabled();

            await userManager.ResetAuthenticatorKeyAsync(user);
            // Cambiar la clave cambia el sello de seguridad: sin renovar la
            // cookie, esta misma sesión se cerraría en la próxima validación.
            // (En el paso intermedio no hay sesión que renovar.)
            if (!pending) await signInManager.RefreshSignInAsync(user);
            var key = await userManager.GetAuthenticatorKeyAsync(user) ?? string.Empty;
            var uri = PanelTwoFactor.AuthenticatorUri(user.Email ?? user.UserName ?? string.Empty, key);
            return Results.Ok(new
            {
                sharedKey = PanelTwoFactor.FormatKey(key),
                authenticatorUri = uri,
                qrSvg = Api.Import.VariantLabelsPdf.QrSvg(uri),
            });
        }).RequireRateLimiting("auth");

        // Confirmar con un código de la app y la contraseña: queda activa y se
        // entregan los códigos de recuperación (se muestran esta única vez). La
        // contraseña, como al desactivarla: con solo la cookie, quien la robara
        // activaría su propia app, se quedaría con los códigos y dejaría afuera
        // al dueño (que para desactivarla ya no tendría ni código).
        setupGroup.MapPost("/enable", async (
            TwoFactorEnableRequest req,
            HttpContext http,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor,
            TwoFactorRequirement requirement) =>
        {
            var (user, pending) = await ResolveAsync(http, userManager);
            if (user is null) return NoSessionNorSetupStep();
            if (user.TwoFactorEnabled) return AlreadyEnabled();
            if (await userManager.GetAuthenticatorKeyAsync(user) is null)
                return Results.Problem(title: "Auth.TwoFactorNotStarted",
                    detail: "Empezá de nuevo: tocá \"Activar\" para ver el código QR.", statusCode: 409);
            if (string.IsNullOrEmpty(req.Password))
                return Results.Problem(title: "Auth.PasswordRequired",
                    detail: "Escribí tu contraseña para confirmar.", statusCode: 400);
            if (await ConfirmAsync(user, new TwoFactorConfirmRequest(Password: req.Password), userManager, twoFactor) is { } denied)
                return denied;

            if (!await twoFactor.VerifyAuthenticatorCodeAsync(user, req.Code))
                return InvalidCode();

            await userManager.SetTwoFactorEnabledAsync(user, true);
            var codes = await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, PanelTwoFactor.RecoveryCodeCount);
            if (pending)
            {
                // Quien la tenía que configurar para entrar: contraseña y código
                // ya probados, se abre la sesión (como al pasar el segundo paso).
                await http.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
                await signInManager.SignInWithClaimsAsync(user, isPersistent: true, [new Claim("amr", "mfa")]);
            }
            else
            {
                await signInManager.RefreshSignInAsync(user);
            }
            return Results.Ok(new
            {
                recoveryCodes = codes,
                user = AuthEndpoints.ToDto(user, await requirement.AppliesToAsync(user.Id)),
            });
        }).RequireRateLimiting("auth");

        // Desactivarla pide la contraseña o un código (de la app o de recuperación).
        // A dueños y administradores no se les deja, si la plataforma la exige.
        manage.MapPost("/disable", async (
            TwoFactorConfirmRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor,
            TwoFactorRequirement requirement) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (!user.TwoFactorEnabled) return Results.NoContent(); // idempotente
            if (await requirement.AppliesToAsync(user.Id))
                return Results.Problem(title: "Auth.TwoFactorRequired",
                    detail: "Para dueños y administradores la verificación en dos pasos es obligatoria: no se puede desactivar. Si cambiaste de teléfono, pasala a la app nueva.",
                    statusCode: StatusCodes.Status403Forbidden);
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

        // Pasarla a otra app (teléfono nuevo): pide la contraseña Y un código
        // (de la app de antes o de recuperación). Devuelve la clave nueva y un
        // ticket cifrado con ella; nada cambia hasta confirmar con un código
        // de la app nueva en /relink/confirm. Los códigos de recuperación siguen.
        manage.MapPost("/relink", async (
            TwoFactorConfirmRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            PanelTwoFactor twoFactor) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (!user.TwoFactorEnabled)
                return Results.Problem(title: "Auth.TwoFactorDisabled",
                    detail: "La verificación en dos pasos no está activa.", statusCode: 409);
            if (string.IsNullOrEmpty(req.Password) || string.IsNullOrWhiteSpace(req.Code))
                return Results.Problem(title: "Auth.ConfirmationRequired",
                    detail: "Escribí tu contraseña y un código (de la app o de recuperación) para confirmar.", statusCode: 400);
            // Las dos cosas, cada una contando para el bloqueo por intentos.
            if (await ConfirmAsync(user, new TwoFactorConfirmRequest(Password: req.Password), userManager, twoFactor) is { } badPassword)
                return badPassword;
            if (await ConfirmAsync(user, new TwoFactorConfirmRequest(Code: req.Code), userManager, twoFactor) is { } badCode)
                return badCode;

            var (key, ticket) = twoFactor.StartRelink(user);
            var uri = PanelTwoFactor.AuthenticatorUri(user.Email ?? user.UserName ?? string.Empty, key);
            return Results.Ok(new
            {
                sharedKey = PanelTwoFactor.FormatKey(key),
                authenticatorUri = uri,
                qrSvg = Api.Import.VariantLabelsPdf.QrSvg(uri),
                ticket,
            });
        }).RequireRateLimiting("auth");

        manage.MapPost("/relink/confirm", async (
            TwoFactorRelinkConfirmRequest req,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            PanelTwoFactor twoFactor,
            IUserStore<AppUser> userStore) =>
        {
            var user = await userManager.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            if (!user.TwoFactorEnabled)
                return Results.Problem(title: "Auth.TwoFactorDisabled",
                    detail: "La verificación en dos pasos no está activa.", statusCode: 409);
            if (twoFactor.ReadRelinkTicket(user, req.Ticket) is not { } key)
                return Results.Problem(title: "Auth.InvalidTicket",
                    detail: "Pasó demasiado tiempo. Empezá de nuevo para ver otro código QR.", statusCode: 400);
            if (await userManager.IsLockedOutAsync(user)) return LockedOut();
            if (!twoFactor.VerifyCodeForKey(user, key, req.Code))
            {
                await userManager.AccessFailedAsync(user);
                return await userManager.IsLockedOutAsync(user) ? LockedOut() : InvalidCode();
            }

            // La clave nueva por el store (cifrada, como siempre): UserManager
            // solo sabe generar una al azar, no guardar una ya confirmada.
            await ((IUserAuthenticatorKeyStore<AppUser>)userStore).SetAuthenticatorKeyAsync(user, key, CancellationToken.None);
            await userManager.ResetAccessFailedCountAsync(user);
            await userManager.UpdateSecurityStampAsync(user); // guarda y cierra las otras sesiones
            await signInManager.RefreshSignInAsync(user);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        return auth;
    }

    /// <summary>
    /// Quién configura la verificación: la persona con sesión o, si no hay
    /// sesión, quien está en el paso intermedio "para configurar" del login
    /// (contraseña ya validada; ver <see cref="PanelTwoFactor.PendingSetupPrincipal"/>).
    /// El paso intermedio del código (el de quien ya la tiene) no sirve acá.
    /// </summary>
    private static async Task<(AppUser? User, bool Pending)> ResolveAsync(HttpContext http, UserManager<AppUser> userManager)
    {
        if (await userManager.GetUserAsync(http.User) is { } user) return (user, false);

        var step = await http.AuthenticateAsync(IdentityConstants.TwoFactorUserIdScheme);
        if (step.Succeeded && PanelTwoFactor.SetupUserId(step.Principal) is { } id
            && await userManager.FindByIdAsync(id.ToString()) is { } pendingUser)
            return (pendingUser, true);
        return (null, false);
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

    /// <summary>
    /// 401 sin sesión ni paso intermedio: lo más común es que el paso de
    /// configurarla al entrar (15 minutos) haya vencido.
    /// </summary>
    private static IResult NoSessionNorSetupStep() =>
        Results.Problem(title: "Auth.TwoFactorExpired",
            detail: "Pasó demasiado tiempo. Volvé a ingresar tu contraseña.", statusCode: 401);

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
public sealed record TwoFactorEnableRequest(string? Code, string? Password = null);
public sealed record TwoFactorConfirmRequest(string? Password = null, string? Code = null);
public sealed record TwoFactorRelinkConfirmRequest(string? Ticket, string? Code);
