using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Api.Startup;

/// <summary>
/// Compresión de las respuestas de la API (Brotli, o Gzip si el cliente no
/// la acepta). Antes el JSON viajaba entero: los listados del panel y el
/// catálogo que pide la tienda desde el navegador pesan varias veces más sin
/// comprimir, y Caddy (que termina TLS adelante) no comprime.
/// </summary>
public static class ResponseCompressionSetup
{
    public static IServiceCollection AddAppResponseCompression(this IServiceCollection services)
    {
        services.AddResponseCompression(options =>
        {
            // En producción la API recibe http (TLS termina en Caddy), pero
            // UseForwardedHeaders reescribe el esquema a https con el
            // X-Forwarded-Proto, y sin esto el middleware no comprimiría nada.
            // El riesgo de comprimir sobre HTTPS (BREACH) necesita un secreto y
            // texto del atacante en la MISMA respuesta: lo que devuelve
            // credenciales queda afuera (ver AppResponseCompressionProvider).
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            // Solo texto. Los archivos (PDF, etiquetas, imágenes) ya vienen
            // comprimidos o los arma quien los sirve; no se tocan.
            options.MimeTypes = ["application/json", "application/problem+json", "text/plain"];
        });

        // Fastest: casi toda la ganancia de tamaño por una fracción del CPU de
        // Optimal; la API arma cada respuesta en el momento, no son estáticos.
        services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
        services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

        services.Replace(ServiceDescriptor.Singleton<IResponseCompressionProvider, AppResponseCompressionProvider>());
        return services;
    }
}

/// <summary>
/// La decisión de comprimir, con dos excepciones sobre la de ASP.NET:
/// respuestas chicas (si se conoce el largo) y rutas que devuelven credenciales.
/// </summary>
public sealed class AppResponseCompressionProvider(
    IServiceProvider services,
    IOptions<ResponseCompressionOptions> options) : ResponseCompressionProvider(services, options)
{
    /// <summary>
    /// Por debajo de esto, comprimir no ahorra nada (gzip suma ~20 bytes de
    /// encabezado). Solo se aplica cuando la respuesta declara su largo: el
    /// JSON de los endpoints se escribe en streaming y no lo sabe de antemano.
    /// </summary>
    public const int MinimumBytes = 1024;

    /// <summary>Login, sesión y el token de preview del editor: nunca comprimidos (BREACH).</summary>
    private static readonly PathString[] WithCredentials =
    [
        "/api/v1/auth",
        "/api/v1/shop/auth",
        "/api/v1/theme/preview-token",
    ];

    public override bool ShouldCompressResponse(HttpContext context)
    {
        if (context.Response.ContentLength is < MinimumBytes) return false;

        foreach (var path in WithCredentials)
            if (context.Request.Path.StartsWithSegments(path)) return false;

        return base.ShouldCompressResponse(context);
    }
}
