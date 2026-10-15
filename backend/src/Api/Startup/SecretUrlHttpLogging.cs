using Microsoft.Extensions.Http.Logging;

namespace Api.Startup;

/// <summary>
/// Logs de HttpClient sin la URL para los clientes que llevan un secreto en
/// ella: el token del bot de Telegram va en el path (<c>/bot{token}/sendMessage</c>)
/// y Meta lleva <c>access_token</c> y <c>client_secret</c> en la query.
///
/// <para>
/// IHttpClientFactory loguea por defecto, en Information, "Start processing
/// HTTP request POST {url}" con la URL entera, y Serilog escribe Information
/// de esas categorías (<c>System.Net.Http.HttpClient.*</c> no cae bajo el
/// override de "Microsoft"). Desde .NET 9 la query sale redactada, pero el
/// path no: el token de cada bot de Telegram terminaba en los logs. Para estos
/// clientes se sacan los loggers por defecto y se deja uno que escribe solo
/// método, host, status y duración.
/// </para>
/// </summary>
public static class SecretUrlHttpLogging
{
    public static IHttpClientBuilder WithoutUrlInLogs(this IHttpClientBuilder builder)
    {
        var name = builder.Name;
        return builder
            .RemoveAllLoggers()
            .AddLogger(sp => new HostOnlyLogger(
                sp.GetRequiredService<ILoggerFactory>().CreateLogger($"System.Net.Http.HttpClient.{name}.HostOnly")));
    }

    private sealed class HostOnlyLogger(ILogger logger) : IHttpClientLogger
    {
        public object? LogRequestStart(HttpRequestMessage request) => null;

        public void LogRequestStop(
            object? context, HttpRequestMessage request, HttpResponseMessage response, TimeSpan elapsed) =>
            logger.LogInformation("HTTP {Method} {Host} respondió {StatusCode} en {ElapsedMs:0} ms",
                request.Method, request.RequestUri?.Host, (int)response.StatusCode, elapsed.TotalMilliseconds);

        // Sin la excepción: su mensaje puede traer la URL. Quien hizo el pedido
        // la recibe igual y decide qué loguear.
        public void LogRequestFailed(
            object? context, HttpRequestMessage request, HttpResponseMessage? response, Exception exception, TimeSpan elapsed) =>
            logger.LogWarning("HTTP {Method} {Host} falló ({Error}) en {ElapsedMs:0} ms",
                request.Method, request.RequestUri?.Host, exception.GetType().Name, elapsed.TotalMilliseconds);
    }
}
