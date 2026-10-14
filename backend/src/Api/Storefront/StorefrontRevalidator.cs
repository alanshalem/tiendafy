using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using SharedKernel.Abstractions;

namespace Api.Storefront;

/// <summary>
/// Adónde avisarle al storefront que algo publicado cambió. Vacío = apagado:
/// la tienda sigue con sus ventanas de caché por tiempo (30 a 60 s).
/// </summary>
public sealed class StorefrontOptions
{
    public const string SectionName = "Storefront";

    /// <summary>La ruta de revalidación por la red interna (http://storefront:3000/internal/revalidate).</summary>
    public string RevalidateUrl { get; set; } = string.Empty;

    /// <summary>El mismo valor que REVALIDATE_SECRET en el storefront.</summary>
    public string RevalidateSecret { get; set; } = string.Empty;

    public bool Configured =>
        !string.IsNullOrWhiteSpace(RevalidateUrl) && !string.IsNullOrWhiteSpace(RevalidateSecret);
}

/// <summary>Las familias de la caché del storefront (ver storefront/src/lib/cache.ts).</summary>
public enum StorefrontScope
{
    Theme,
    Catalog,
    Categories,
    Tenant,
}

/// <summary>
/// Le pide al storefront que vence su caché de una tienda. Antes un cambio
/// publicado (el diseño, un precio, el stock) tardaba hasta un minuto en verse
/// y el comercio creía que no se había guardado.
/// </summary>
public interface IStorefrontRevalidator
{
    /// <summary>
    /// Avisa, como mucho en unos segundos, y nunca tira: si el storefront no
    /// contesta solo queda en el log y la caché vence sola por tiempo. No hace
    /// falta esperarlo.
    /// </summary>
    Task RevalidateAsync(Guid tenantId, params StorefrontScope[] scopes);
}

public sealed class StorefrontRevalidator(
    IHttpClientFactory httpFactory,
    IOptions<StorefrontOptions> options,
    ILogger<StorefrontRevalidator> logger) : IStorefrontRevalidator
{
    public const string HttpClientName = "storefront-revalidate";

    /// <summary>Corto a propósito: es un aviso, y la caché igual vence sola.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(3);

    public async Task RevalidateAsync(Guid tenantId, params StorefrontScope[] scopes)
    {
        var o = options.Value;
        if (!o.Configured || scopes.Length == 0) return;

        var wire = scopes.Distinct().Select(Wire).ToArray();
        try
        {
            using var http = httpFactory.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(HttpMethod.Post, o.RevalidateUrl)
            {
                Content = JsonContent.Create(new { tenantId, scopes = wire }),
            };
            request.Headers.Add("X-Revalidate-Secret", o.RevalidateSecret);
            // Sin el token del request: el aviso sale cuando la respuesta ya se
            // mandó, y cancelarlo junto con ella no tendría sentido.
            using var response = await http.SendAsync(request, CancellationToken.None);
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("El storefront contestó {Status} al revalidar {Scopes} de {TenantId}.",
                    (int)response.StatusCode, string.Join(",", wire), tenantId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo avisar al storefront ({Scopes} de {TenantId}); vence solo por tiempo.",
                string.Join(",", wire), tenantId);
        }
    }

    private static string Wire(StorefrontScope scope) => scope switch
    {
        StorefrontScope.Theme => "theme",
        StorefrontScope.Catalog => "catalog",
        StorefrontScope.Categories => "categories",
        StorefrontScope.Tenant => "tenant",
        _ => throw new ArgumentOutOfRangeException(nameof(scope)),
    };
}

public static class StorefrontRevalidationExtensions
{
    /// <summary>
    /// Toda escritura que termine bien (2xx) en estos endpoints avisa al
    /// storefront. El aviso sale después de mandar la respuesta: el panel no
    /// espera por él. La tienda sale del header (o, en /tenants/{id}, de la ruta).
    /// </summary>
    public static TBuilder RevalidatesStorefront<TBuilder>(this TBuilder builder, params StorefrontScope[] scopes)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var result = await next(ctx);
            var http = ctx.HttpContext;
            var method = http.Request.Method;
            if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
                return result;

            var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
            Guid? tenantId = tenant.HasTenant
                ? tenant.TenantId.Value
                : Guid.TryParse(http.GetRouteValue("id")?.ToString(), out var id) ? id : null;
            if (tenantId is null) return result;

            // Resuelto ahora: en OnCompleted el scope del request ya puede estar cerrado.
            var revalidator = http.RequestServices.GetRequiredService<IStorefrontRevalidator>();
            http.Response.OnCompleted(() =>
            {
                if (http.Response.StatusCode is >= 200 and < 300)
                    _ = revalidator.RevalidateAsync(tenantId.Value, scopes);
                return Task.CompletedTask;
            });
            return result;
        });
        return builder;
    }
}
