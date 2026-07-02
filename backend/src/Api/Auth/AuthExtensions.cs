using System.Security.Claims;
using Identity.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Auth;

public static class AuthExtensions
{
    /// <summary>Id del usuario de plataforma autenticado (claim NameIdentifier), o null.</summary>
    public static Guid? GetUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    /// <summary>
    /// Exige usuario autenticado Y que sea miembro de la tienda del header
    /// X-Tenant-Id. Para endpoints de administración (escritura y datos privados).
    /// </summary>
    public static RouteHandlerBuilder RequireTenantMembership(this RouteHandlerBuilder builder) =>
        builder.RequireAuthorization().AddEndpointFilter(MembershipFilter);

    /// <summary>
    /// Igual que el anterior pero a nivel grupo: protege TODOS los endpoints del
    /// grupo (lecturas incluidas) cuando el grupo entero es de administración
    /// (customers, stats, inventory, email-templates).
    /// </summary>
    public static RouteGroupBuilder RequireTenantMembership(this RouteGroupBuilder builder)
    {
        builder.RequireAuthorization().AddEndpointFilter(MembershipFilter);
        return builder;
    }

    /// <summary>Como RequireTenantMembership pero exige rol owner (gestión de staff, etc.).</summary>
    public static RouteGroupBuilder RequireTenantOwner(this RouteGroupBuilder builder)
    {
        builder.RequireAuthorization().AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
            if (!tenant.HasTenant) return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var memberships = http.RequestServices.GetRequiredService<IMembershipService>();
            if (!await memberships.IsOwnerAsync(userId.Value, tenant.TenantId.Value, http.RequestAborted))
                return Results.Problem(title: "Auth.Forbidden", detail: "Solo el dueño de la tienda puede hacer esto.", statusCode: StatusCodes.Status403Forbidden);
            return await next(ctx);
        });
        return builder;
    }

    /// <summary>
    /// Exige solo el header X-Tenant-Id (sin auth). Para lecturas públicas del
    /// storefront que igual necesitan saber de qué tienda son (productos, categorías,
    /// páginas publicadas, tema público, etc.). Reemplaza el guard repetido
    /// `if (!tenant.HasTenant) return BadRequest(...)`.
    /// </summary>
    public static RouteGroupBuilder RequireTenant(this RouteGroupBuilder builder)
    {
        builder.AddEndpointFilter(TenantFilter);
        return builder;
    }

    /// <summary>Igual que el anterior pero por endpoint.</summary>
    public static RouteHandlerBuilder RequireTenant(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(TenantFilter);

    private static async ValueTask<object?> TenantFilter(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var tenant = ctx.HttpContext.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant)
            return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });
        return await next(ctx);
    }

    private static async ValueTask<object?> MembershipFilter(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant)
            return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

        var userId = http.User.GetUserId();
        if (userId is null) return Results.Unauthorized();

        var memberships = http.RequestServices.GetRequiredService<IMembershipService>();
        if (!await memberships.IsMemberAsync(userId.Value, tenant.TenantId.Value, http.RequestAborted))
            return Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);

        return await next(ctx);
    }
}
