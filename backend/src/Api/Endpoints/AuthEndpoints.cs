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
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager) =>
        {
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
        });

        auth.MapPost("/login", async (
            LoginRequest request,
            SignInManager<AppUser> signInManager,
            UserManager<AppUser> userManager) =>
        {
            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
                return Results.Problem(title: "Auth.InvalidCredentials", detail: "Email o contraseña incorrectos.", statusCode: 401);

            var result = await signInManager.PasswordSignInAsync(
                user, request.Password, isPersistent: true, lockoutOnFailure: true);

            return result.Succeeded
                ? Results.Ok(ToDto(user))
                : Results.Problem(title: "Auth.InvalidCredentials", detail: "Email o contraseña incorrectos.", statusCode: 401);
        });

        auth.MapPost("/logout", async (SignInManager<AppUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        });

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
}

public sealed record RegisterRequest(string Name, string Email, string Password);
public sealed record LoginRequest(string Email, string Password);
