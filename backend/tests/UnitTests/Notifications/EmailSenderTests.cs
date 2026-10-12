using System.Net;
using Api.Notifications;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace UnitTests.Notifications;

/// <summary>
/// El envío por Resend: sin clave no sale nada (modo dev), el remitente lleva
/// el nombre de la tienda, un error definitivo no se reintenta, uno
/// transitorio sí —con la misma Idempotency-Key, para que Resend no mande el
/// mail dos veces— y la red caída se reintenta hasta el tope.
/// </summary>
public sealed class EmailSenderTests
{
    private sealed class StubResend(params Func<HttpResponseMessage>[] responses) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];
        public List<string> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(request);
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return responses[Math.Min(Requests.Count - 1, responses.Length - 1)]();
        }
    }

    private static EmailSender Sender(StubResend stub, string apiKey = "re_test", int maxRetries = 1) =>
        new(new HttpClient(stub), Options.Create(new EmailOptions
        {
            ResendApiKey = apiKey,
            From = "Tiendafy <no-reply@tiendafy.com>",
            MaxRetries = maxRetries,
        }), NullLogger<EmailSender>.Instance);

    private static HttpResponseMessage Status(HttpStatusCode code) => new(code) { Content = new StringContent("{}") };

    [Fact]
    public async Task Sin_clave_de_Resend_no_manda_nada()
    {
        var stub = new StubResend(() => Status(HttpStatusCode.OK));
        await Sender(stub, apiKey: "").SendAsync("ana@mail.com", "Hola", "<p>x</p>");
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task El_remitente_lleva_el_nombre_de_la_tienda_y_el_tag_para_los_rebotes()
    {
        var stub = new StubResend(() => Status(HttpStatusCode.OK));
        await Sender(stub).SendAsync("ana@mail.com", "Tu compra", "<p>x</p>",
            fromName: "Tienda \"La Esquina\"", replyTo: "ventas@laesquina.com", tenantTag: "t-1");

        var body = Assert.Single(stub.Bodies);
        Assert.Contains("\\u0022Tienda La Esquina\\u0022 \\u003Cno-reply@tiendafy.com\\u003E", body, StringComparison.Ordinal);
        Assert.Contains("ventas@laesquina.com", body, StringComparison.Ordinal);
        Assert.Contains("\"value\":\"t-1\"", body, StringComparison.Ordinal);
        Assert.Equal("re_test", stub.Requests[0].Headers.Authorization!.Parameter);
    }

    [Fact]
    public async Task Un_error_definitivo_no_se_reintenta()
    {
        var stub = new StubResend(() => Status(HttpStatusCode.UnprocessableEntity));
        await Sender(stub, maxRetries: 3).SendAsync("ana@mail.com", "Hola", "<p>x</p>");
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task Un_error_transitorio_se_reintenta_con_la_misma_clave_de_idempotencia()
    {
        var stub = new StubResend(() => Status(HttpStatusCode.ServiceUnavailable), () => Status(HttpStatusCode.OK));
        await Sender(stub).SendAsync("ana@mail.com", "Hola", "<p>x</p>");

        Assert.Equal(2, stub.Requests.Count);
        var keys = stub.Requests.Select(r => r.Headers.GetValues("Idempotency-Key").Single()).Distinct();
        Assert.Single(keys);
    }

    [Fact]
    public async Task Con_la_red_caida_reintenta_hasta_el_tope_y_se_rinde()
    {
        var stub = new StubResend(() => throw new HttpRequestException("sin red"));
        await Sender(stub, maxRetries: 1).SendAsync("ana@mail.com", "Hola", "<p>x</p>");
        Assert.Equal(2, stub.Requests.Count);
    }

    [Fact]
    public async Task Un_429_que_no_cede_se_abandona_tras_los_reintentos()
    {
        var stub = new StubResend(() => Status(HttpStatusCode.TooManyRequests));
        await Sender(stub, maxRetries: 1).SendAsync("ana@mail.com", "Hola", "<p>x</p>");
        Assert.Equal(2, stub.Requests.Count);
    }
}
