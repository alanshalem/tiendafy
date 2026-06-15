using SharedKernel.Common;
using SharedKernel.Domain;

namespace Payments.Core.Domain;

/// <summary>Cómo cobra el merchant: redirect (Pro) o on-site (API/Bricks).</summary>
public enum MercadoPagoCheckoutMode
{
    Pro = 0, // redirect a MercadoPago — mayor conversión, mínimo código
    Api = 1, // tokenización on-site con Bricks/Checkout API — UI propia
}

/// <summary>
/// Conexión OAuth de un merchant con su cuenta de MercadoPago. Una por tenant.
/// Guardamos el access/refresh token del SELLER (cifrados) para procesar pagos
/// en su nombre. El token de acceso vence a los ~6 meses; el refresh lo renueva.
/// </summary>
public sealed class MercadoPagoConnection : AggregateRoot
{
    public long MercadoPagoUserId { get; private set; }
    public string AccessTokenEncrypted { get; private set; } = null!;
    public string RefreshTokenEncrypted { get; private set; } = null!;
    public string? PublicKey { get; private set; }
    public string Scope { get; private set; } = string.Empty;
    public DateTime TokenExpiresAtUtc { get; private set; }
    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public MercadoPagoCheckoutMode CheckoutMode { get; private set; }
    public decimal MarketplaceFeePercent { get; private set; }
    public string? StatementDescriptor { get; private set; }

    private MercadoPagoConnection() { } // EF Core

    private MercadoPagoConnection(Guid id, TenantId tenantId) : base(id, tenantId) { }

    public static MercadoPagoConnection Create(
        TenantId tenantId,
        long userId,
        string accessTokenEncrypted,
        string refreshTokenEncrypted,
        string? publicKey,
        string scope,
        DateTime tokenExpiresAtUtc)
    {
        var now = DateTime.UtcNow;
        return new MercadoPagoConnection(Guid.NewGuid(), tenantId)
        {
            MercadoPagoUserId = userId,
            AccessTokenEncrypted = accessTokenEncrypted,
            RefreshTokenEncrypted = refreshTokenEncrypted,
            PublicKey = publicKey,
            Scope = scope,
            TokenExpiresAtUtc = tokenExpiresAtUtc,
            ConnectedAtUtc = now,
            UpdatedAtUtc = now,
            CheckoutMode = MercadoPagoCheckoutMode.Pro,
            MarketplaceFeePercent = 0m,
        };
    }

    /// <summary>Re-conexión o refresh: reemplaza los tokens conservando preferencias.</summary>
    public void UpdateTokens(
        long userId,
        string accessTokenEncrypted,
        string refreshTokenEncrypted,
        string? publicKey,
        string scope,
        DateTime tokenExpiresAtUtc)
    {
        MercadoPagoUserId = userId;
        AccessTokenEncrypted = accessTokenEncrypted;
        RefreshTokenEncrypted = refreshTokenEncrypted;
        if (!string.IsNullOrEmpty(publicKey)) PublicKey = publicKey;
        Scope = scope;
        TokenExpiresAtUtc = tokenExpiresAtUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetCheckoutMode(MercadoPagoCheckoutMode mode)
    {
        CheckoutMode = mode;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetMarketplaceFee(decimal percent)
    {
        MarketplaceFeePercent = Math.Clamp(percent, 0m, 100m);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetStatementDescriptor(string? descriptor)
    {
        var trimmed = descriptor?.Trim();
        StatementDescriptor = string.IsNullOrEmpty(trimmed)
            ? null
            : trimmed[..Math.Min(22, trimmed.Length)];
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
