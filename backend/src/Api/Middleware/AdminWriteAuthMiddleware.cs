using Api.Auth;
using Identity.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Middleware;

/// <summary>
/// Protege TODA escritura de administración: el usuario debe estar autenticado y
/// ser miembro de la tienda del header X-Tenant-Id. Cubre productos, categorías,
/// cupones, inventario, customers, theme, pages, etc. sin tocar cada endpoint.
///
/// Allowlist = rutas públicas que escriben sin sesión de admin (storefront):
/// checkout, tracking, webhook de pagos, /shop/* (auth de comprador con bearer),
/// validación de cupón, /auth/* (login del propio admin) y /tenants (auth propia).
/// Las lecturas (GET) quedan abiertas (storefront las usa).
/// </summary>
public sealed class AdminWriteAuthMiddleware(RequestDelegate next)
{
    private static readonly string[] PublicWritePrefixes =
    {
        "/api/v1/auth/",
        "/api/v1/tenants",
        "/api/v1/checkout",
        "/api/v1/track",
        "/api/v1/shop/",
        "/api/v1/coupons/validate",
        "/api/v1/payments/webhook",
        "/api/v1/contact/submit",
        "/api/v1/captcha",
        // Cotización de envío del checkout (pública; NO cubre /admin/shipping/*,
        // que además exige SettingsWrite por RequirePermission).
        "/api/v1/shipping/correo/quote",
        "/api/v1/shipping/zipnova/quote",
    };

    public async Task InvokeAsync(HttpContext ctx, IMembershipService memberships)
    {
        var method = ctx.Request.Method;
        var isWrite = HttpMethods.IsPost(method) || HttpMethods.IsPut(method)
            || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method);
        var path = ctx.Request.Path.Value ?? string.Empty;

        var isApi = path.StartsWith("/api/v1/", StringComparison.OrdinalIgnoreCase);
        var isPublic = PublicWritePrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

        if (isWrite && isApi && !isPublic)
        {
            var userId = ctx.User.GetUserId();
            if (userId is null)
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            var tenant = ctx.RequestServices.GetRequiredService<ITenantContext>();
            if (!tenant.HasTenant)
            {
                ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                await ctx.Response.WriteAsJsonAsync(new { error = AuthExtensions.MissingTenantHeaderMessage });
                return;
            }

            if (!await memberships.IsMemberAsync(userId.Value, tenant.TenantId.Value, ctx.RequestAborted))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ctx.Response.WriteAsJsonAsync(new { title = "Auth.Forbidden", detail = "No tenés acceso a esta tienda." });
                return;
            }
        }

        await next(ctx);
    }
}
