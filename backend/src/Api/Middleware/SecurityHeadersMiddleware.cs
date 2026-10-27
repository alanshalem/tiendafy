namespace Api.Middleware;

/// <summary>
/// Headers de defensa para todas las respuestas de la API. Es una API de JSON:
/// nada de lo que devuelve tiene que renderizarse ni enmarcarse en otra página.
///
/// - nosniff: el navegador no adivina el tipo de un archivo servido (una
///   imagen subida no se interpreta como HTML).
/// - X-Frame-Options + frame-ancestors 'none': nadie puede embeber la API
///   (clickjacking sobre pantallas de consentimiento, como el OAuth).
/// - Referrer-Policy no-referrer: las URLs de la API pueden llevar tokens firmados.
///
/// En Development la UI de Scalar (/scalar) queda afuera: carga scripts y
/// estilos de un CDN y se rompería con un CSP tan cerrado.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next, IHostEnvironment env)
{
    public Task InvokeAsync(HttpContext ctx)
    {
        var docsUi = env.IsDevelopment()
            && (ctx.Request.Path.StartsWithSegments("/scalar") || ctx.Request.Path.StartsWithSegments("/openapi"));

        ctx.Response.OnStarting(() =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["Referrer-Policy"] = "no-referrer";
            if (!docsUi)
            {
                h["X-Frame-Options"] = "DENY";
                h["Content-Security-Policy"] = "frame-ancestors 'none'";
            }
            return Task.CompletedTask;
        });

        return next(ctx);
    }
}
