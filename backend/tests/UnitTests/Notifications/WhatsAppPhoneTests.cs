using System.Net;
using Api.Notifications;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace UnitTests.Notifications;

/// <summary>Normalización de teléfonos argentinos a E.164 (Cloud API).</summary>
public class WhatsAppPhoneTests
{
    [Theory]
    [InlineData("1123456789", "5491123456789")]        // CABA 10 dígitos
    [InlineData("11 2345-6789", "5491123456789")]      // con formato
    [InlineData("011 2345 6789", "5491123456789")]     // con 0 inicial
    [InlineData("5491123456789", "5491123456789")]     // ya E.164
    [InlineData("+54 9 11 2345-6789", "5491123456789")]
    [InlineData("54 11 23456789", "5491123456789")]    // 54 sin 9
    [InlineData("3512345678", "5493512345678")]        // Córdoba
    [InlineData("0351 15 234-5678", "5493512345678")]  // interior con 15
    public void Normalize_ValidArgentinePhones(string raw, string expected) =>
        Assert.Equal(expected, WhatsAppSender.NormalizeArPhone(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("123")]          // muy corto
    [InlineData("abcdefghij")]   // sin dígitos suficientes
    [InlineData("19998887777")]  // no argentino (empieza con 1)
    public void Normalize_Invalid_ReturnsNull(string? raw) =>
        Assert.Null(WhatsAppSender.NormalizeArPhone(raw));

    [Theory]
    [InlineData("5491123456789", "***6789")]
    [InlineData("+54 9 11 2345-6789", "***6789")]
    [InlineData("123456", "***")]   // tan corto que los últimos 4 serían casi todo
    [InlineData(null, "***")]
    public void MaskPhone_DejaSoloLosUltimosCuatro(string? raw, string expected) =>
        Assert.Equal(expected, LogValue.MaskPhone(raw));

    /// <summary>Lo que el sender escribe en los logs, con o sin error de Meta.</summary>
    [Theory]
    [InlineData(HttpStatusCode.OK)]
    [InlineData(HttpStatusCode.BadRequest)]
    public async Task Los_logs_no_llevan_el_telefono_entero(HttpStatusCode status)
    {
        const string phone = "5491123456789";
        var logger = new ListLogger();
        // El error de Meta puede repetir el número: también se enmascara.
        var sender = new WhatsAppSender(new HttpClient(new Respond(status,
            $$$"""{"error":{"message":"Recipient phone number {{{phone}}} not in allowed list"}}""")), logger);

        await sender.SendTemplateAsync("phone-id", "token", phone, "confirmacion_pago", "es_AR", ["Ana"]);

        Assert.NotEmpty(logger.Lines);
        Assert.All(logger.Lines, l => Assert.DoesNotContain(phone, l));
        Assert.Contains(logger.Lines, l => l.Contains("***6789"));
    }

    private sealed class Respond(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
    }

    private sealed class ListLogger : ILogger<WhatsAppSender>
    {
        public List<string> Lines { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Lines.Add(formatter(state, exception));
    }
}
