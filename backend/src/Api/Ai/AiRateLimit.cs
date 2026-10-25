using System.Threading.RateLimiting;
using Api.Auth;
using Api.Startup;
using SharedKernel.Abstractions;

namespace Api.Ai;

/// <summary>Qué cupo de IA cuenta un endpoint.</summary>
public enum AiRateLimitKind
{
    /// <summary>Por usuario y ruta: <c>RateLimiting:AiPermitLimit</c> (30) cada 5 minutos.</summary>
    PerUser,

    /// <summary>Por tienda: <c>RateLimiting:AiJobsPermitLimit</c> (5) por hora, para los trabajos de catálogo.</summary>
    JobsPerTenant,
}

/// <summary>
/// Los cupos de IA. No son políticas de <c>UseRateLimiter</c>: ese middleware corre antes de la
/// autenticación y de la resolución de la tienda, así que ahí solo se conoce la IP. Se cuentan en un
/// filtro de endpoint (<see cref="AiRateLimitExtensions.RequireAiRateLimit(RouteHandlerBuilder, AiRateLimitKind)"/>),
/// cuando el usuario y la tienda ya están probados. Singleton: el estado vive en memoria.
/// </summary>
public sealed class AiRateLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> _perUser;
    private readonly PartitionedRateLimiter<string> _jobsPerTenant;

    public AiRateLimiter(IConfiguration configuration)
    {
        var perUser = configuration.GetValue("RateLimiting:AiPermitLimit", 30);
        var jobs = configuration.GetValue("RateLimiting:AiJobsPermitLimit", 5);
        _perUser = Create(perUser, TimeSpan.FromMinutes(5));
        _jobsPerTenant = Create(jobs, TimeSpan.FromHours(1));
    }

    private static PartitionedRateLimiter<string> Create(int permitLimit, TimeSpan window) =>
        PartitionedRateLimiter.Create<string, string>(key =>
            RateLimitPartition.GetFixedWindowLimiter(key,
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = window, QueueLimit = 0 }));

    /// <summary>Cuenta una llamada. Null = pasa; si no, cuánto falta para volver a probar (si se sabe).</summary>
    public (bool Allowed, TimeSpan? RetryAfter) TryAcquire(AiRateLimitKind kind, string key)
    {
        using var lease = (kind == AiRateLimitKind.PerUser ? _perUser : _jobsPerTenant).AttemptAcquire(key);
        if (lease.IsAcquired) return (true, null);
        return (false, lease.TryGetMetadata(MetadataName.RetryAfter, out var after) ? after : null);
    }

    public void Dispose()
    {
        _perUser.Dispose();
        _jobsPerTenant.Dispose();
    }
}

public static class AiRateLimitExtensions
{
    /// <summary>
    /// Cupo de IA del endpoint (429 con Retry-After al pasarse). Agregalo DESPUÉS de
    /// <c>RequirePermission</c> / <c>RequireTenant</c>: los filtros corren en el orden en que se
    /// registran, y recién ahí el usuario es un miembro probado de la tienda (la tienda no se puede
    /// falsear para gastar el cupo de otra). Sin usuario o sin tienda no deja pasar (401 / 400).
    /// </summary>
    public static RouteHandlerBuilder RequireAiRateLimit(this RouteHandlerBuilder builder, AiRateLimitKind kind)
    {
        builder.AddEndpointFilter((ctx, next) => Filter(ctx, next, kind));
        return builder;
    }

    /// <summary>Igual que el anterior pero a nivel grupo.</summary>
    public static RouteGroupBuilder RequireAiRateLimit(this RouteGroupBuilder builder, AiRateLimitKind kind)
    {
        builder.AddEndpointFilter((ctx, next) => Filter(ctx, next, kind));
        return builder;
    }

    internal static async ValueTask<object?> Filter(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next, AiRateLimitKind kind)
    {
        var http = ctx.HttpContext;
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
        if (!tenant.HasTenant) return AuthExtensions.MissingTenant();

        var userId = http.User.GetUserId();
        if (userId is null) return Results.Unauthorized();

        // El patrón de la ruta y no el path: en /purchase-orders/{id}/invoice/scan cada orden tendría
        // su propio cupo y el límite no protegería nada.
        var route = (http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? http.Request.Path.ToString();
        var key = kind == AiRateLimitKind.PerUser
            ? $"{userId}:{route}"
            : tenant.TenantId.Value.ToString();

        var (allowed, retryAfter) = http.RequestServices.GetRequiredService<AiRateLimiter>().TryAcquire(kind, key);
        return allowed ? await next(ctx) : ServiceRegistration.RateLimitExceeded(http, retryAfter);
    }
}
