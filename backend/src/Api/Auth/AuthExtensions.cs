using System.Security.Claims;
using Identity.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Auth;

public static class AuthExtensions
{
    /// <summary>Mensaje único del 400 cuando falta el header X-Tenant-Id.</summary>
    public const string MissingTenantHeaderMessage = "Missing X-Tenant-Id header.";

    /// <summary>400 estándar cuando falta el header X-Tenant-Id (cuerpo JSON compartido).</summary>
    public static IResult MissingTenant() => Results.BadRequest(new { error = MissingTenantHeaderMessage });

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

    /// <summary>
    /// RBAC: exige auth + membresía + que el rol del usuario tenga el permiso.
    /// Deny by default según la matriz de RolePermissions. Loguea denegaciones
    /// (detección de intentos de escalación).
    /// </summary>
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, Permission permission) =>
        builder.RequireAuthorization().AddEndpointFilter((ctx, next) => PermissionFilter(ctx, next, permission));

    /// <summary>Igual que el anterior pero a nivel grupo.</summary>
    public static RouteGroupBuilder RequirePermission(this RouteGroupBuilder builder, Permission permission)
    {
        builder.RequireAuthorization().AddEndpointFilter((ctx, next) => PermissionFilter(ctx, next, permission));
        return builder;
    }

    /// <summary>
    /// Para grupos mixtos público/admin (products, categories, theme, media…):
    /// los GET siguen siendo públicos (storefront) y toda escritura
    /// (POST/PUT/PATCH/DELETE) exige el permiso. Cierra el hueco de writes
    /// anónimos con solo el header de tenant.
    /// </summary>
    public static RouteGroupBuilder RequirePermissionForWrites(this RouteGroupBuilder builder, Permission permission)
    {
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var method = ctx.HttpContext.Request.Method;
            if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
                return await next(ctx);
            return await PermissionFilter(ctx, next, permission);
        });
        return builder;
    }

    private static async ValueTask<object?> PermissionFilter(
        EndpointFilterInvocationContext ctx, EndpointFilterDelegate next, Permission permission)
    {
        var http = ctx.HttpContext;
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant) return MissingTenant();

        var userId = http.User.GetUserId();
        if (userId is null) return Results.Unauthorized();

        var memberships = http.RequestServices.GetRequiredService<IMembershipService>();
        var role = await memberships.RoleAsync(userId.Value, tenant.TenantId.Value, http.RequestAborted);
        if (role is null)
            return Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);

        if (!RolePermissions.Has(role, permission))
        {
            http.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("Rbac")
                .LogWarning("Permiso denegado: user {UserId} rol {Role} pidió {Permission} en {Path} (tenant {TenantId}).",
                    userId, role, permission, http.Request.Path, tenant.TenantId.Value);
            return Results.Problem(title: "Auth.Forbidden",
                detail: "Tu rol no tiene permiso para esta acción.", statusCode: StatusCodes.Status403Forbidden);
        }

        return await next(ctx);
    }

    /// <summary>Como RequireTenantMembership pero exige rol owner (gestión de staff, etc.).</summary>
    public static RouteGroupBuilder RequireTenantOwner(this RouteGroupBuilder builder)
    {
        builder.RequireAuthorization().AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
            if (!tenant.HasTenant) return MissingTenant();
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
            return MissingTenant();
        return await next(ctx);
    }

    private static async ValueTask<object?> MembershipFilter(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant)
            return MissingTenant();

        var userId = http.User.GetUserId();
        if (userId is null) return Results.Unauthorized();

        var memberships = http.RequestServices.GetRequiredService<IMembershipService>();
        if (!await memberships.IsMemberAsync(userId.Value, tenant.TenantId.Value, http.RequestAborted))
            return Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);

        return await next(ctx);
    }
}
