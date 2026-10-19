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

    /// <summary>
    /// Lo que admite Mercado Pago para el nombre en el resumen de la tarjeta:
    /// la guía de Checkout Pro dice "hasta 13 caracteres" (revisado el
    /// 19-oct-2026); la referencia de <c>/v1/payments</c> no da un límite, así
    /// que vale el más restrictivo para los dos modos.
    /// </summary>
    public const int StatementDescriptorMaxLength = 13;

    /// <summary>
    /// Cambia el nombre del resumen. Más de <see cref="StatementDescriptorMaxLength"/>
    /// caracteres es un error, salvo que sea el que ya estaba guardado: antes se
    /// aceptaban 22, y una tienda con uno así tiene que poder seguir guardando
    /// el resto de sus preferencias (el cobro manda el recortado, ver
    /// <see cref="StatementDescriptorToSend"/>).
    /// </summary>
    public Result SetStatementDescriptor(string? descriptor)
    {
        var trimmed = descriptor?.Trim();
        var value = string.IsNullOrEmpty(trimmed) ? null : trimmed;
        if (value is { Length: > StatementDescriptorMaxLength } && value != StatementDescriptor)
            return Result.Failure(Error.Validation("MercadoPago.StatementDescriptorTooLong",
                $"El nombre en el resumen de la tarjeta puede tener hasta {StatementDescriptorMaxLength} caracteres."));

        StatementDescriptor = value;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// El nombre que viaja a Mercado Pago, nunca más largo que lo que admite:
    /// uno guardado cuando el límite era 22 sale recortado en vez de arriesgar
    /// que Mercado Pago rechace la preferencia o el pago.
    /// </summary>
    public string? StatementDescriptorToSend =>
        StatementDescriptor?[..Math.Min(StatementDescriptorMaxLength, StatementDescriptor.Length)].TrimEnd();
}
