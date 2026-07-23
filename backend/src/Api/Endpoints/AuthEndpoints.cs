using System.Security.Claims;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;

namespace Api.Endpoints;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder group)
    {
        var auth = group.MapGroup("/auth");

        auth.MapPost("/register", async (
            RegisterRequest request,
            Api.Captcha.ICaptchaVerifier captcha,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager) =>
        {
            if (!await captcha.VerifyAsync(request.Captcha))
                return Results.Problem(title: "Captcha.Failed", detail: "Verificación anti-bots fallida.", statusCode: 400);

            var user = new AppUser
            {
                UserName = request.Email,
                Email = request.Email,
                DisplayName = request.Name.Trim(),
            };

            var result = await userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
            {
                return Results.ValidationProblem(result.Errors
                    .GroupBy(e => e.Code)
                    .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray()));
            }

            await signInManager.SignInAsync(user, isPersistent: true);
            return Results.Created($"/api/v1/auth/me", ToDto(user));
        }).RequireRateLimiting("auth");

        auth.MapPost("/login", async (
            LoginRequest request,
            Api.Captcha.ICaptchaVerifier captcha,
            SignInManager<AppUser> signInManager,
            UserManager<AppUser> userManager) =>
        {
            if (!await captcha.VerifyAsync(request.Captcha))
                return Results.Problem(title: "Captcha.Failed", detail: "Verificación anti-bots fallida.", statusCode: 400);

            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
            {
                // Hash "dummy" para igualar el tiempo de respuesta y no filtrar por
                // timing si el email existe o no (anti enumeración de cuentas).
                userManager.PasswordHasher.HashPassword(new AppUser(), request.Password);
                return Results.Problem(title: "Auth.InvalidCredentials", detail: "Email o contraseña incorrectos.", statusCode: 401);
            }

            var result = await signInManager.PasswordSignInAsync(
                user, request.Password, isPersistent: true, lockoutOnFailure: true);

            return result.Succeeded
                ? Results.Ok(ToDto(user))
                : Results.Problem(title: "Auth.InvalidCredentials", detail: "Email o contraseña incorrectos.", statusCode: 401);
        }).RequireRateLimiting("auth");

        auth.MapPost("/logout", async (SignInManager<AppUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        });

        // ¿Olvidaste tu contraseña? (admin). Respuesta uniforme (204) → no enumera.
        auth.MapPost("/forgot", async (ForgotRequest req, HttpContext http, UserManager<AppUser> userManager, Api.Notifications.IEmailSender email, IConfiguration cfg, CancellationToken ct) =>
        {
            var user = await userManager.FindByEmailAsync(req.Email ?? string.Empty);
            if (user is not null && !string.IsNullOrEmpty(user.Email))
            {
                var token = await userManager.GeneratePasswordResetTokenAsync(user);
                var origin = http.Request.Headers.Origin.ToString();
                var baseUrl = IsSafeAdminOrigin(origin, cfg) ? origin.TrimEnd('/') : string.Empty;
                var link = $"{baseUrl}/restablecer?email={Uri.EscapeDataString(user.Email)}&token={Uri.EscapeDataString(token)}";
                await email.SendAsync(user.Email, "Restablecé tu contraseña (admin)",
                    $"""<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>Restablecé tu contraseña</h2><p>El link vence en poco. Si no fuiste vos, ignorá este email.</p><p><a href="{link}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Cambiar contraseña</a></p><p style="color:#888;font-size:12px;word-break:break-all">{link}</p></div>""", ct: ct);
            }
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        auth.MapPost("/reset", async (ResetRequest req, UserManager<AppUser> userManager) =>
        {
            var user = await userManager.FindByEmailAsync(req.Email ?? string.Empty);
            if (user is null)
                return Results.Problem(title: "Auth.InvalidToken", detail: "El link no es válido o expiró.", statusCode: 400);
            var result = await userManager.ResetPasswordAsync(user, req.Token, req.Password);
            if (!result.Succeeded)
                return Results.Problem(title: "Auth.InvalidToken", detail: "El link no es válido o expiró.", statusCode: 400);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        auth.MapGet("/me", async (ClaimsPrincipal principal, UserManager<AppUser> userManager) =>
        {
            var user = await userManager.GetUserAsync(principal);
            return user is null ? Results.Unauthorized() : Results.Ok(ToDto(user));
        }).RequireAuthorization();

        return group;
    }

    private static object ToDto(AppUser user) => new
    {
        id = user.Id,
        email = user.Email,
        name = user.DisplayName,
    };

    /// <summary>Origin propio del admin (localhost/*.localhost o dominio de plataforma).</summary>
    private static bool IsSafeAdminOrigin(string? origin, IConfiguration cfg)
    {
        if (string.IsNullOrWhiteSpace(origin) || !Uri.TryCreate(origin, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        var host = u.Host.ToLowerInvariant();
        if (host == "localhost" || host.EndsWith(".localhost")) return true;
        var platform = (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
        return host == platform || host.EndsWith("." + platform);
    }
}

public sealed record RegisterRequest(string Name, string Email, string Password, string? Captcha = null);
public sealed record LoginRequest(string Email, string Password, string? Captcha = null);
public sealed record ForgotRequest(string Email);
public sealed record ResetRequest(string Email, string Token, string Password);
