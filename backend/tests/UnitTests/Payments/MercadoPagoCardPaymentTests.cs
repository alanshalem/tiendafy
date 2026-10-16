using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Payments.Contracts;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using Payments.Infrastructure.MercadoPago;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Payments;

/// <summary>
/// El cobro con tarjeta en la tienda (Payment Brick → <c>POST /v1/payments</c>)
/// pide 3DS en modo opcional y, cuando el banco exige el desafío, devuelve lo
/// necesario para mostrarlo. Sin <c>three_d_secure_mode</c>, Mercado Pago usa
/// <c>not_supported</c> y el 3DS no se pide nunca: así estuvo hasta el 16-oct-2026.
/// </summary>
public class MercadoPagoCardPaymentTests
{
    private const string AcsUrl = "https://acs-public.tp.mastercard.com/api/v1/browser_Challenges";

    [Fact]
    public async Task Pide_3DS_opcional_con_captura_automatica_y_sin_binary_mode()
    {
        var (client, handler) = Make(new { id = 52044997115, status = "approved", status_detail = "accredited" });

        var result = await client.CreateCardPaymentAsync(Request());

        Assert.True(result.IsSuccess);
        using var body = JsonDocument.Parse(handler.Body!);
        var root = body.RootElement;
        Assert.Equal("optional", root.GetProperty("three_d_secure_mode").GetString());
        Assert.True(root.GetProperty("capture").GetBoolean());
        Assert.False(root.GetProperty("binary_mode").GetBoolean());
        // Aprobado sin desafío: no hay nada que mostrar.
        Assert.Null(result.Value.Challenge);
        Assert.False(result.Value.IsPendingChallenge);
    }

    [Fact]
    public async Task Con_desafio_devuelve_la_url_del_banco_y_el_creq()
    {
        var (client, _) = Make(new
        {
            id = 52044997115,
            status = "pending",
            status_detail = "pending_challenge",
            three_ds_info = new { external_resource_url = AcsUrl, creq = "eyJjcmVxIjoxfQ" },
        });

        var result = await client.CreateCardPaymentAsync(Request());

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsPendingChallenge);
        Assert.Equal("52044997115", result.Value.PaymentId);
        Assert.Equal(new ThreeDsChallenge(AcsUrl, "eyJjcmVxIjoxfQ"), result.Value.Challenge);
    }

    [Theory]
    [InlineData("http://acs.banco.com/challenge", "creq")] // sin https: no va a un iframe de la tienda
    [InlineData("javascript:alert(1)", "creq")]
    [InlineData("/relativa", "creq")]
    [InlineData(AcsUrl, "")]
    [InlineData(null, "creq")]
    public async Task Un_desafio_sin_datos_utilizables_no_se_muestra(string? url, string creq)
    {
        var (client, _) = Make(new
        {
            id = 1,
            status = "pending",
            status_detail = "pending_challenge",
            three_ds_info = new { external_resource_url = url, creq },
        });

        var result = await client.CreateCardPaymentAsync(Request());

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsPendingChallenge);
        Assert.Null(result.Value.Challenge);
    }

    [Fact]
    public async Task Un_pendiente_que_no_es_desafio_no_trae_desafio()
    {
        // Revisión manual o contingencia: se espera el webhook, no hay nada que mostrar.
        var (client, _) = Make(new
        {
            id = 1,
            status = "in_process",
            status_detail = "pending_contingency",
            three_ds_info = new { external_resource_url = AcsUrl, creq = "x" },
        });

        var result = await client.CreateCardPaymentAsync(Request());

        Assert.False(result.Value.IsPendingChallenge);
        Assert.Null(result.Value.Challenge);
    }

    // ---------------------------------------------------------------- helpers

    private static CreateCardPaymentRequest Request() =>
        new(Tenant, Guid.NewGuid(), 30_000m, "card-token", "master", 1, null, "comprador@test.local", "DNI", "30111222");

    private static (MercadoPagoCheckoutClient Client, StubHandler Handler) Make(object response)
    {
        var handler = new StubHandler(JsonSerializer.Serialize(response));
        var repo = new FakeRepo
        {
            Connection = MercadoPagoConnection.Create(Tenant, 999, "enc(AT)", "enc(RT)", "PUB", "read",
                DateTime.UtcNow.AddMonths(6)),
        };
        var client = new MercadoPagoCheckoutClient(
            new HttpClient(handler),
            Options.Create(new MercadoPagoOptions()),
            repo,
            new NoOAuth(),
            new FakeProtector(),
            NullLogger<MercadoPagoCheckoutClient>.Instance);
        return (client, handler);
    }

    private sealed class StubHandler(string json) : HttpMessageHandler
    {
        public string? Body;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.Created)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
        }
    }

    private sealed class FakeRepo : IMercadoPagoConnectionRepository
    {
        public MercadoPagoConnection? Connection;
        public Task<MercadoPagoConnection?> GetByTenantAsync(TenantId tenantId, CancellationToken ct = default) => Task.FromResult(Connection);
        public Task<MercadoPagoConnection?> GetByMercadoPagoUserIdAsync(long mercadoPagoUserId, CancellationToken ct = default) => Task.FromResult(Connection);
        public Task AddAsync(MercadoPagoConnection connection, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveAsync(MercadoPagoConnection connection, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NoOAuth : IMercadoPagoOAuthClient
    {
        public string BuildAuthorizationUrl(string state) => throw new NotSupportedException();
        public Task<MercadoPagoTokens> ExchangeCodeAsync(string code, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<MercadoPagoTokens> RefreshAsync(string refreshToken, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class FakeProtector : ITokenProtector
    {
        public string Protect(string plaintext) => $"enc({plaintext})";
        public string Unprotect(string ciphertext) => ciphertext[4..^1];
    }
}
