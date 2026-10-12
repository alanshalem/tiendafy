using System.Security.Claims;
using Identity.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

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
    /// RBAC: exige auth + membresía + que la persona tenga el permiso en esta
    /// tienda (su rol, lo que la tienda le cambió a ese rol y sus excepciones).
    /// Deny by default. Loguea denegaciones (detección de intentos de escalación).
    /// </summary>
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, Permission permission) =>
        builder.RequireAuthorization().WithMetadata(new PermissionMetadata([permission]))
            .AddEndpointFilter((ctx, next) => PermissionFilter(ctx, next, permission));

    /// <summary>
    /// Para lo que comparten dos funcionalidades (el estado de la conexión con
    /// Mercado Libre lo necesitan quien atiende y quien publica): alcanza con
    /// tener ALGUNO de los permisos.
    /// </summary>
    public static RouteHandlerBuilder RequireAnyPermission(this RouteHandlerBuilder builder, params Permission[] anyOf) =>
        builder.RequireAuthorization().WithMetadata(new PermissionMetadata(anyOf)).AddEndpointFilter(async (ctx, next) =>
            await CheckPermissionAsync(ctx.HttpContext, anyOf) is { } denied ? denied : await next(ctx));

    /// <summary>Igual que el anterior pero a nivel grupo.</summary>
    public static RouteGroupBuilder RequirePermission(this RouteGroupBuilder builder, Permission permission)
    {
        builder.RequireAuthorization().WithMetadata(new PermissionMetadata([permission]))
            .AddEndpointFilter((ctx, next) => PermissionFilter(ctx, next, permission));
        return builder;
    }

    /// <summary>
    /// Defensa CSRF para endpoints con auth por cookie (shopper): en métodos que
    /// cambian estado, exige que el header Origin sea del propio dominio. Los GET
    /// pasan siempre. Complementa el SameSite=Lax de la cookie.
    /// </summary>
    public static RouteGroupBuilder RequireSameOriginForWrites(this RouteGroupBuilder builder)
    {
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var method = ctx.HttpContext.Request.Method;
            if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
                return await next(ctx);

            var origin = ctx.HttpContext.Request.Headers.Origin.ToString();
            var cfg = ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            // Sin Origin (algunos clientes no lo mandan) caemos al Referer; si tampoco,
            // rechazamos las escrituras cross-site.
            var check = !string.IsNullOrEmpty(origin) ? origin : ctx.HttpContext.Request.Headers.Referer.ToString();
            if (Uri.TryCreate(check, UriKind.Absolute, out var u) && SafeRedirect.IsOwnHost(u.Host, cfg))
                return await next(ctx);

            return Results.Problem(title: "Auth.CrossOrigin",
                detail: "Petición de origen no permitido.", statusCode: StatusCodes.Status403Forbidden);
        });
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
        builder.WithMetadata(new PermissionMetadata([permission], WritesOnly: true));
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
        var denied = await CheckPermissionAsync(ctx.HttpContext, permission);
        return denied is not null ? denied : await next(ctx);
    }

    /// <summary>
    /// Chequeo RBAC reutilizable fuera del filtro (endpoints con auth alternativa,
    /// p.ej. token de preview del editor). Null = permitido; IResult = denegación.
    /// </summary>
    public static async Task<IResult?> CheckPermissionAsync(HttpContext http, params Permission[] anyOf)
    {
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant) return MissingTenant();

        var userId = http.User.GetUserId();
        if (userId is null) return Results.Unauthorized();

        var access = await http.RequestServices.GetRequiredService<IAccessService>()
            .GetAsync(userId.Value, tenant.TenantId.Value, http.RequestAborted);
        if (access is null) return NotAMember();

        if (!anyOf.Any(access.Can))
        {
            http.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("Rbac")
                .LogWarning("Permiso denegado: user {UserId} rol {Role} pidió {Permission} en {Path} (tenant {TenantId}).",
                    userId, access.Role, string.Join(" | ", anyOf), LogValue.Safe(http.Request.Path.ToString()), tenant.TenantId.Value);
            return Results.Problem(title: "Auth.Forbidden",
                detail: "No tenés permiso para esta acción.", statusCode: StatusCodes.Status403Forbidden);
        }

        return null;
    }

    /// <summary>
    /// Lo que puede el usuario logueado en la tienda del header, o null (sin
    /// sesión, sin tienda o sin ser del equipo). Para los endpoints que deciden
    /// por su cuenta (lectura del comprador o del equipo, varias tiendas).
    /// </summary>
    public static async Task<MemberAccess?> GetAccessAsync(this HttpContext http, Guid? tenantId = null)
    {
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        var tid = tenantId ?? (tenant.HasTenant ? tenant.TenantId.Value : null);
        var userId = http.User.GetUserId();
        if (tid is null || userId is null) return null;
        return await http.RequestServices.GetRequiredService<IAccessService>()
            .GetAsync(userId.Value, tid.Value, http.RequestAborted);
    }

    /// <summary>403 de "esta tienda no es tuya" (cuerpo compartido).</summary>
    public static IResult NotAMember() =>
        Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);


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

        if (http.User.GetUserId() is null) return Results.Unauthorized();
        if (await http.GetAccessAsync() is null) return NotAMember();

        return await next(ctx);
    }
}

/// <summary>
/// Qué permiso exige un endpoint, como metadato (el filtro es el que lo hace
/// cumplir). Sirve para recorrer la API entera y verificar que ninguna
/// funcionalidad del panel quede fuera de la matriz de permisos.
/// </summary>
/// <param name="AnyOf">Alcanza con tener alguno.</param>
/// <param name="WritesOnly">Solo las escrituras lo exigen; las lecturas son del storefront.</param>
public sealed record PermissionMetadata(IReadOnlyList<Permission> AnyOf, bool WritesOnly = false);
