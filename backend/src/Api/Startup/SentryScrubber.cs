using System.Text.RegularExpressions;
using Sentry;

namespace Api.Startup;

/// <summary>
/// Lo que Sentry no tiene que guardar: los secretos que viajan en una URL.
///
/// Con Sentry prendido, cada llamada HTTP que hace la API queda como
/// breadcrumb (y como span, si hay tracing) con la URL entera, y un error
/// trae la URL del pedido que lo causó. Ahí viajan secretos: el token del bot
/// de Telegram va en el path (<c>/bot&lt;token&gt;/sendMessage</c>), Meta
/// pide el <c>access_token</c> en la query, y los links firmados del mail
/// (<c>?t=</c>, <c>?token=</c>) son llaves de por sí. Sentry solo tapa el
/// usuario y la clave de <c>https://user:pass@…</c>; el resto pasa entero.
///
/// <see cref="Redact"/> es la única regla, y se aplica a todo texto que pueda
/// llevar una URL: datos y mensaje de los breadcrumbs, URL, query y headers
/// del pedido, mensajes de excepción, y descripción y datos de los spans.
/// </summary>
public static partial class SentryScrubber
{
    public const string Filtered = "[Filtered]";

    /// <summary>El path de la API de bots de Telegram: /bot&lt;id&gt;:&lt;secreto&gt;/…</summary>
    [GeneratedRegex(@"(?<=/bot)\d+:[A-Za-z0-9_-]+", RegexOptions.CultureInvariant)]
    private static partial Regex TelegramBotToken();

    /// <summary>Un parámetro de query (o de un form urlencoded) con su valor, adentro de cualquier texto.</summary>
    [GeneratedRegex(@"(?<sep>[?&;])(?<name>[^=&#\s?;]+)=(?<value>[^&#\s;""'<>]*)", RegexOptions.CultureInvariant)]
    private static partial Regex QueryParameter();

    /// <summary>
    /// Nombres de parámetro o de header que llevan un secreto. Además de los
    /// obvios: <c>t</c> es el link firmado de los mails (seguimiento del
    /// pedido, clics de campañas, reseñas) y <c>pt</c> la vista previa del
    /// editor. La misma lista que usan el panel y la tienda (sentry-scrub.ts
    /// de @tiendafy/types).
    /// </summary>
    public static bool IsSensitiveName(string name)
    {
        var n = name.Trim().ToLowerInvariant();
        return n is "t" or "pt" or "key" or "sig" or "signature" or "pwd" or "authorization" or "proxy-authorization"
                   or "cookie" or "set-cookie"
               || n.Contains("token", StringComparison.Ordinal)
               || n.Contains("secret", StringComparison.Ordinal)
               || n.Contains("password", StringComparison.Ordinal)
               || n.Contains("passwd", StringComparison.Ordinal)
               || n.EndsWith("_key", StringComparison.Ordinal)
               || n.EndsWith("-key", StringComparison.Ordinal)
               || n.EndsWith("apikey", StringComparison.Ordinal);
    }

    /// <summary>
    /// Tapa el token del bot de Telegram en el path y el valor de los
    /// parámetros sensibles de la query. Funciona sobre una URL suelta o
    /// sobre un texto que la contiene (un mensaje de log, una excepción). Lo
    /// demás queda igual, letra por letra.
    /// </summary>
    public static string? Redact(string? text)
    {
        if (string.IsNullOrEmpty(text)) return text;

        var result = text.Contains("/bot", StringComparison.Ordinal)
            ? TelegramBotToken().Replace(text, Filtered)
            : text;
        if (result.Contains('=', StringComparison.Ordinal))
        {
            result = QueryParameter().Replace(result, m =>
                IsSensitiveName(Uri.UnescapeDataString(m.Groups["name"].Value)) && m.Groups["value"].Length > 0
                    ? $"{m.Groups["sep"].Value}{m.Groups["name"].Value}={Filtered}"
                    : m.Value);
        }

        return result;
    }

    /// <summary>Una query string suelta, con o sin el "?" adelante ("a=1&amp;token=x").</summary>
    public static string? RedactQuery(string? query)
    {
        if (string.IsNullOrEmpty(query)) return query;
        return query.StartsWith('?') ? Redact(query) : Redact("?" + query)![1..];
    }

    /// <summary>Breadcrumbs: el de cada llamada HTTP lleva la URL en sus datos.</summary>
    public static Breadcrumb Scrub(Breadcrumb crumb)
    {
        var message = Redact(crumb.Message);
        Dictionary<string, string>? data = null;
        if (crumb.Data is { Count: > 0 })
        {
            data = crumb.Data.ToDictionary(kv => kv.Key, kv => RedactValue(kv.Key, kv.Value)!);
            if (data.All(kv => crumb.Data[kv.Key] == kv.Value)) data = null;
        }

        // Breadcrumb es inmutable: se arma otro solo si hubo algo que tapar.
        return message == crumb.Message && data is null
            ? crumb
            : new Breadcrumb(message ?? string.Empty, crumb.Type ?? "default",
                data ?? crumb.Data, crumb.Category, crumb.Level);
    }

    public static SentryEvent Scrub(SentryEvent evt)
    {
        ScrubRequest(evt.Request);
        // Por la clave y no por Contexts.Response, que crea uno vacío si no hay.
        if (evt.Contexts.TryGetValue("response", out var context) && context is Sentry.Protocol.Response response)
            ScrubHeaders(response.Headers);
        if (evt.Message is { } message)
        {
            message.Message = Redact(message.Message);
            message.Formatted = Redact(message.Formatted);
        }

        if (evt.SentryExceptions is { } exceptions)
        {
            var list = exceptions.ToList();
            foreach (var ex in list) ex.Value = Redact(ex.Value);
            evt.SentryExceptions = list;
        }

        foreach (var (key, value) in evt.Extra.ToList())
        {
            if (value is string s && RedactValue(key, s) is var redacted && redacted != s) evt.SetExtra(key, redacted);
        }

        foreach (var (key, value) in evt.Tags.ToList())
        {
            if (RedactValue(key, value) is { } redacted && redacted != value) evt.SetTag(key, redacted);
        }

        return evt;
    }

    public static SentryTransaction Scrub(SentryTransaction transaction)
    {
        ScrubRequest(transaction.Request);
        transaction.Description = Redact(transaction.Description);
        foreach (var span in transaction.Spans)
        {
            // Un span de cliente HTTP: "GET https://api.telegram.org/bot…/sendMessage".
            span.Description = Redact(span.Description);
            foreach (var (key, value) in span.Data.ToList())
            {
                if (value is string s && RedactValue(key, s) is var redacted && redacted != s) span.SetData(key, redacted);
            }
        }

        return transaction;
    }

    /// <summary>Engancha el scrubber en todo lo que Sentry manda.</summary>
    public static void Configure(SentryOptions options)
    {
        options.SetBeforeBreadcrumb((crumb, _) => Scrub(crumb));
        options.SetBeforeSend((evt, _) => Scrub(evt));
        options.SetBeforeSendTransaction((transaction, _) => Scrub(transaction));
    }

    private static void ScrubRequest(SentryRequest request)
    {
        request.Url = Redact(request.Url);
        request.QueryString = RedactQuery(request.QueryString);
        if (!string.IsNullOrEmpty(request.Cookies)) request.Cookies = Filtered;
        ScrubHeaders(request.Headers);
    }

    private static void ScrubHeaders(IDictionary<string, string> headers)
    {
        foreach (var key in headers.Keys.ToList())
        {
            if (IsSensitiveName(key)) headers[key] = Filtered;
            else headers[key] = Redact(headers[key])!; // el Referer, por ejemplo, es una URL entera
        }
    }

    /// <summary>Un dato con nombre: si el nombre ya es de un secreto, se tapa entero.</summary>
    private static string? RedactValue(string key, string? value) =>
        string.IsNullOrEmpty(value) ? value
        : key.Equals("http.query", StringComparison.OrdinalIgnoreCase) ? RedactQuery(value)
        : IsSensitiveName(key) ? Filtered
        : Redact(value);
}
