using Microsoft.Extensions.Logging.Abstractions;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using Payments.Core.Features.Connect;
using SharedKernel.Common;

namespace UnitTests.Payments;

/// <summary>
/// Callback OAuth de MercadoPago: valida el state firmado, canjea el code por
/// tokens, los CIFRA y crea (o actualiza) la conexión del seller. Si algo de
/// esto se rompe, los merchants no pueden conectar su cuenta = no cobran.
/// </summary>
public class OAuthCallbackHandlerTests
{
    private static readonly TenantId Tenant = TenantId.New();

    private sealed class FakeOAuthClient : IMercadoPagoOAuthClient
    {
        public MercadoPagoTokens? Tokens;
        public string BuildAuthorizationUrl(string state) => $"https://mp/authorize?state={state}";
        public Task<MercadoPagoTokens> ExchangeCodeAsync(string code, CancellationToken ct = default) =>
            Tokens is null ? throw new HttpRequestException("mp caído") : Task.FromResult(Tokens);
        public Task<MercadoPagoTokens> RefreshAsync(string refreshToken, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class FakeProtector : ITokenProtector
    {
        public string Protect(string plaintext) => $"enc({plaintext})";
        public string Unprotect(string ciphertext) => ciphertext[4..^1];
    }

    private sealed class FakeStateProtector : IOAuthStateProtector
    {
        public string Protect(TenantId tenantId) => $"state-{tenantId.Value}";
        public TenantId? TryUnprotect(string state) =>
            state.StartsWith("state-") && Guid.TryParse(state[6..], out var g) ? new TenantId(g) : null;
    }

    private sealed class FakeRepo : IMercadoPagoConnectionRepository
    {
        public MercadoPagoConnection? Existing;
        public MercadoPagoConnection? Added;
        public int Saves;
        public Task<MercadoPagoConnection?> GetByTenantAsync(TenantId tenantId, CancellationToken ct = default) => Task.FromResult(Existing);
        public Task<MercadoPagoConnection?> GetByMercadoPagoUserIdAsync(long mercadoPagoUserId, CancellationToken ct = default) => Task.FromResult(Existing);
        public Task AddAsync(MercadoPagoConnection connection, CancellationToken ct = default) { Added = connection; return Task.CompletedTask; }
        public Task RemoveAsync(MercadoPagoConnection connection, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) { Saves++; return Task.CompletedTask; }
    }

    private static OAuthCallbackHandler Handler(FakeOAuthClient client, FakeRepo repo) =>
        new(client, new FakeProtector(), new FakeStateProtector(), repo, NullLogger<OAuthCallbackHandler>.Instance);

    private static MercadoPagoTokens Tokens() =>
        new(UserId: 999, AccessToken: "AT-secreto", RefreshToken: "RT-secreto", PublicKey: "PUB-1", Scope: "read", ExpiresInSeconds: 3600);

    [Fact]
    public async Task Primera_conexion_crea_la_conexion_con_tokens_CIFRADOS()
    {
        var client = new FakeOAuthClient { Tokens = Tokens() };
        var repo = new FakeRepo();
        var handler = Handler(client, repo);

        var result = await handler.HandleAsync("code-1", $"state-{Tenant.Value}");

        Assert.True(result.IsSuccess);
        Assert.NotNull(repo.Added);
        Assert.Equal(999, repo.Added!.MercadoPagoUserId);
        // Los tokens NUNCA quedan en claro:
        Assert.Equal("enc(AT-secreto)", repo.Added.AccessTokenEncrypted);
        Assert.Equal("enc(RT-secreto)", repo.Added.RefreshTokenEncrypted);
        Assert.DoesNotContain("AT-secreto", repo.Added.AccessTokenEncrypted.Replace("enc(AT-secreto)", ""));
        Assert.Equal(1, repo.Saves);
    }

    [Fact]
    public async Task Reconexion_actualiza_los_tokens_de_la_conexion_existente()
    {
        var existente = MercadoPagoConnection.Create(Tenant, 111, "viejo-at", "viejo-rt", "PUB-viejo", "read", DateTime.UtcNow);
        var client = new FakeOAuthClient { Tokens = Tokens() };
        var repo = new FakeRepo { Existing = existente };
        var handler = Handler(client, repo);

        var result = await handler.HandleAsync("code-2", $"state-{Tenant.Value}");

        Assert.True(result.IsSuccess);
        Assert.Null(repo.Added); // no crea una segunda conexión
        Assert.Equal(999, existente.MercadoPagoUserId);
        Assert.Equal("enc(AT-secreto)", existente.AccessTokenEncrypted);
        Assert.Equal(1, repo.Saves);
    }

    [Fact]
    public async Task State_invalido_se_rechaza_sin_llamar_a_MP()
    {
        var client = new FakeOAuthClient(); // sin tokens: si lo llaman, explota
        var handler = Handler(client, new FakeRepo());

        var result = await handler.HandleAsync("code", "state-trucho");

        Assert.False(result.IsSuccess);
        Assert.Equal("MercadoPago.InvalidState", result.Error.Code);
    }

    [Fact]
    public async Task Fallo_del_exchange_devuelve_error_amigable_sin_persistir_nada()
    {
        var client = new FakeOAuthClient(); // ExchangeCodeAsync lanza
        var repo = new FakeRepo();
        var handler = Handler(client, repo);

        var result = await handler.HandleAsync("code", $"state-{Tenant.Value}");

        Assert.False(result.IsSuccess);
        Assert.Equal("MercadoPago.ExchangeFailed", result.Error.Code);
        Assert.Null(repo.Added);
        Assert.Equal(0, repo.Saves);
    }
}
