using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Todo el HTTP que la API hace hacia afuera —Andreani, Correo, Mercado Pago,
/// Mercado Libre, Meta, ARCA…— termina acá en los tests de integración.
///
/// <para>
/// Dos motivos. Uno: un test no puede depender de que un servicio ajeno esté
/// arriba ni mandarle pedidos de verdad. Dos: con respuestas programadas se
/// recorre el adaptador entero —armar el pedido, leer la respuesta, traducir
/// el error— junto con el endpoint que lo usa, que es donde se rompen las
/// integraciones.
/// </para>
///
/// <para>
/// Lo que no tiene respuesta programada recibe un 503: el camino de "el
/// servicio externo no anda", que también hay que probar. Las respuestas se
/// buscan por método y prefijo de URL; la más específica (el prefijo más
/// largo) gana.
/// </para>
/// </summary>
public sealed class FakeHttp
{
    private readonly ConcurrentDictionary<string, Func<HttpRequestMessage, string?, HttpResponseMessage>> _routes = new();
    private readonly ConcurrentQueue<Recorded> _requests = new();

    /// <summary>Un pedido que salió hacia afuera, con su cuerpo ya leído.</summary>
    public sealed record Recorded(HttpMethod Method, Uri Uri, string? Body, IReadOnlyDictionary<string, string> Headers);

    /// <summary>Responde a <paramref name="method"/> sobre cualquier URL que empiece con <paramref name="urlPrefix"/>.</summary>
    public void On(HttpMethod method, string urlPrefix, Func<HttpRequestMessage, string?, HttpResponseMessage> respond) =>
        _routes[$"{method} {urlPrefix}"] = respond;

    /// <summary>Atajo: siempre el mismo JSON con ese status.</summary>
    public void OnJson(HttpMethod method, string urlPrefix, object body, HttpStatusCode status = HttpStatusCode.OK) =>
        On(method, urlPrefix, (_, _) => Json(body, status));

    /// <summary>Los pedidos que fueron a URLs que empiezan así.</summary>
    public List<Recorded> SentTo(string urlPrefix) =>
        [.. _requests.Where(r => r.Uri.ToString().StartsWith(urlPrefix, StringComparison.OrdinalIgnoreCase))];

    /// <summary>Un email que la API mandó por Resend.</summary>
    public sealed record Email(string To, string Subject, string Html, string? TenantTag);

    /// <summary>Los emails mandados a esa dirección, en orden.</summary>
    public List<Email> EmailsTo(string address) =>
        [.. SentTo(ApiFactory.ResendEmails)
            .Select(r => JsonDocument.Parse(r.Body!).RootElement)
            .Where(e => e.GetProperty("to")[0].GetString()!.Equals(address, StringComparison.OrdinalIgnoreCase))
            .Select(e => new Email(
                e.GetProperty("to")[0].GetString()!,
                e.GetProperty("subject").GetString()!,
                e.GetProperty("html").GetString()!,
                e.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array
                    ? tags[0].GetProperty("value").GetString()
                    : null))];

    public static HttpResponseMessage Json(object body, HttpStatusCode status = HttpStatusCode.OK) => new(status)
    {
        Content = new StringContent(
            body as string ?? JsonSerializer.Serialize(body, Merchant.Json), Encoding.UTF8, "application/json"),
    };

    /// <summary>
    /// Un handler nuevo que atiende con este fake. El factory de HttpClient
    /// descarta los handlers que arma: cada cliente recibe el suyo y el fake
    /// (con sus respuestas y su registro) sobrevive.
    /// </summary>
    public HttpMessageHandler CreateHandler() => new Handler(this);

    private sealed class Handler(FakeHttp fake) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            fake.HandleAsync(request, ct);
    }

    private async Task<HttpResponseMessage> HandleAsync(HttpRequestMessage request, CancellationToken ct)
    {
        // Como la red de verdad, el pedido no se resuelve en el mismo hilo de
        // quien lo hace: sin esto, dos llamadas "en paralelo" corrían de a una.
        await Task.Yield();
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
        // Con los del contenido (Content-Type, Content-Disposition): son los que dicen cómo se sirve un archivo subido.
        var headers = request.Headers.Concat(request.Content?.Headers ?? Enumerable.Empty<KeyValuePair<string, IEnumerable<string>>>())
            .ToDictionary(h => h.Key, h => string.Join(",", h.Value));
        _requests.Enqueue(new Recorded(request.Method, request.RequestUri!, body, headers));

        var url = request.RequestUri!.ToString();
        var match = _routes
            .Where(r => r.Key.StartsWith(request.Method + " ", StringComparison.Ordinal)
                && url.StartsWith(r.Key[(request.Method.Method.Length + 1)..], StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(r => r.Key.Length)
            .Select(r => r.Value)
            .FirstOrDefault();

        if (match is not null)
        {
            var res = match(request, body);
            res.RequestMessage = request;
            return res;
        }

        return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            RequestMessage = request,
            Content = new StringContent($"FakeHttp: sin respuesta programada para {request.Method} {url}"),
        };
    }
}
