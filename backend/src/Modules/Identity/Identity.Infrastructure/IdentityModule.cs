using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Identity.Infrastructure;

public static class IdentityModule
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<AppIdentityDbContext>(configuration);

        services
            .AddIdentityCore<AppUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 10;
                // Sin reglas arbitrarias de mayúsculas/símbolos: longitud > complejidad teatral.
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireDigit = false;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppIdentityDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders(); // tokens de reset de contraseña / 2FA

        // Sesión server-side con cookie httpOnly (ADR sección 9):
        // revocable al instante, sin JWT para el admin.
        services
            .AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddIdentityCookies();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.HttpOnly = true;
            // localhost:5173 → localhost:5080 es same-site (SameSite ignora puerto),
            // y en prod admin.dominio → api.dominio también. Lax alcanza y bloquea
            // requests cross-site de terceros. CSRF tokens igual van en fase Identity 2.
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.Cookie.Name = "tiendafy.session";
            options.ExpireTimeSpan = TimeSpan.FromHours(12);
            options.SlidingExpiration = true;

            // API: nunca redirigir a páginas de login — devolver 401/403.
            options.Events.OnRedirectToLogin = ctx =>
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = ctx =>
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddAuthorization();

        services.AddScoped<IMembershipService, MembershipService>();
        services.AddScoped<IAccessService, AccessService>();
        services.AddScoped<IAuditLog, AuditLog>();

        return services;
    }
}
