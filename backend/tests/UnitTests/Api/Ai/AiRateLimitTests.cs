using System.Net;
using System.Security.Claims;
using Api.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace UnitTests.Api.Ai;

public sealed class AiRateLimitTests
{
    private static readonly object Passed = new();

    private sealed class FakeTenant(Guid? id) : ITenantContext
    {
        public TenantId TenantId { get; } = new(id ?? Guid.Empty);
        public bool HasTenant => id is not null;
    }

    private static AiRateLimiter Limiter(int perUser, int jobs) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["RateLimiting:AiPermitLimit"] = perUser.ToString(),
            ["RateLimiting:AiJobsPermitLimit"] = jobs.ToString(),
        }).Build());

    private static DefaultHttpContext Request(AiRateLimiter limiter, Guid? user, Guid? tenant)
    {
        var services = new ServiceCollection()
            .AddSingleton(limiter)
            .AddSingleton<ITenantContext>(new FakeTenant(tenant))
            .BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        http.Request.Path = "/api/v1/ai/ask";
        http.Connection.RemoteIpAddress = IPAddress.Parse("10.0.0.1"); // misma IP para todos
        if (user is { } id)
            http.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString())], "test"));
        http.Response.Body = new MemoryStream();
        return http;
    }

    private static async Task<object?> Run(HttpContext http, AiRateLimitKind kind) =>
        await AiRateLimitExtensions.Filter(
            new DefaultEndpointFilterInvocationContext(http), _ => ValueTask.FromResult<object?>(Passed), kind);

    [Fact]
    public async Task Dos_usuarios_desde_la_misma_IP_tienen_cupos_separados()
    {
        using var limiter = Limiter(perUser: 1, jobs: 100);
        var tenant = Guid.NewGuid();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();

        Assert.Same(Passed, await Run(Request(limiter, ana, tenant), AiRateLimitKind.PerUser));
        var second = Request(limiter, ana, tenant);
        var rejected = await Run(second, AiRateLimitKind.PerUser);
        Assert.NotSame(Passed, rejected);
        Assert.Equal(StatusCodes.Status429TooManyRequests, (rejected as IStatusCodeHttpResult)?.StatusCode);
        Assert.True(second.Response.Headers.ContainsKey("Retry-After"));

        Assert.Same(Passed, await Run(Request(limiter, beto, tenant), AiRateLimitKind.PerUser));
    }

    [Fact]
    public async Task Una_tienda_no_consume_el_cupo_de_otra()
    {
        using var limiter = Limiter(perUser: 100, jobs: 1);
        var user = Guid.NewGuid();
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        Assert.Same(Passed, await Run(Request(limiter, user, a), AiRateLimitKind.JobsPerTenant));
        var rejected = await Run(Request(limiter, user, a), AiRateLimitKind.JobsPerTenant);
        Assert.Equal(StatusCodes.Status429TooManyRequests, (rejected as IStatusCodeHttpResult)?.StatusCode);

        Assert.Same(Passed, await Run(Request(limiter, user, b), AiRateLimitKind.JobsPerTenant));
    }

    [Fact]
    public async Task Sin_usuario_no_pasa()
    {
        using var limiter = Limiter(perUser: 100, jobs: 100);

        var result = await Run(Request(limiter, user: null, tenant: Guid.NewGuid()), AiRateLimitKind.PerUser);
        Assert.NotSame(Passed, result);
        Assert.Equal(StatusCodes.Status401Unauthorized, (result as IStatusCodeHttpResult)?.StatusCode);

        var noTenant = await Run(Request(limiter, Guid.NewGuid(), tenant: null), AiRateLimitKind.JobsPerTenant);
        Assert.Equal(StatusCodes.Status400BadRequest, (noTenant as IStatusCodeHttpResult)?.StatusCode);
    }
}
