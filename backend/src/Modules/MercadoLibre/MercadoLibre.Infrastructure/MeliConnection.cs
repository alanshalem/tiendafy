using SharedKernel.Common;

namespace MercadoLibre.Infrastructure;

/// <summary>
/// Conexión OAuth de la tienda con Mercado Libre (una por tenant). Los tokens
/// van SIEMPRE cifrados con DataProtection: el access token dura ~6 horas y el
/// refresh token es DE UN SOLO USO (Mercado Libre lo rota en cada refresh), por
/// eso la renovación se serializa por tenant en MeliTokenService.
/// </summary>
public sealed class MeliConnection
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>User id del vendedor en Mercado Libre (resuelve tenant en webhooks).</summary>
    public long MeliUserId { get; private set; }
    public string Nickname { get; private set; } = string.Empty;

    /// <summary>Site del vendedor (MLA = Argentina). Define moneda y categorías.</summary>
    public string SiteId { get; private set; } = "MLA";

    public string AccessTokenEnc { get; private set; } = string.Empty;
    public string RefreshTokenEnc { get; private set; } = string.Empty;
    public DateTime TokenExpiresAtUtc { get; private set; }

    /// <summary>Sincronizar stock Tiendafy → ML para publicaciones vinculadas.</summary>
    public bool StockSyncEnabled { get; private set; }

    /// <summary>Colchón anti-oversell entre canales: en ML se publica stock − buffer.</summary>
    public int StockBufferUnits { get; private set; }

    /// <summary>Sincronizar precios Tiendafy → ML para publicaciones vinculadas.</summary>
    public bool PriceSyncEnabled { get; private set; }

    /// <summary>
    /// Recargo (o descuento, si es negativo) que se aplica al precio local
    /// antes de publicarlo en ML. La comisión del canal es distinta a la de la
    /// tienda propia, así que vender al mismo precio en los dos lados suele
    /// significar vender con la mitad del margen en ML.
    /// </summary>
    public decimal PriceMarkupPct { get; private set; }

    /// <summary>Emitir factura ARCA automáticamente al importar cada venta pagada.</summary>
    public bool AutoInvoiceEnabled { get; private set; }

    /// <summary>
    /// Cuenta de demostración: no hay OAuth detrás. Las pantallas que hoy
    /// consultan la API de Mercado Libre en vivo (preguntas, publicaciones,
    /// reclamos, mensajes) devuelven un ejemplo fijo en vez de salir a la red,
    /// que con una cuenta falsa terminaría en un 401 y un cartel de error.
    ///
    /// Solo lo enciende el sembrador de datos de desarrollo. Una conexión hecha
    /// por el flujo real de OAuth nace y queda siempre en false.
    /// </summary>
    public bool IsDemo { get; private set; }

    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private MeliConnection() { } // EF Core

    public static Result<MeliConnection> Create(
        Guid tenantId, long meliUserId, string nickname, string siteId,
        string accessTokenEnc, string refreshTokenEnc, DateTime tokenExpiresAtUtc)
    {
        if (tenantId == Guid.Empty)
            return Result.Failure<MeliConnection>(Error.Validation("Meli.Tenant", "Tenant requerido."));
        if (meliUserId <= 0)
            return Result.Failure<MeliConnection>(Error.Validation("Meli.User", "User id de Mercado Libre inválido."));
        if (string.IsNullOrWhiteSpace(accessTokenEnc))
            return Result.Failure<MeliConnection>(Error.Validation("Meli.Token", "Token vacío."));

        return Result.Success<MeliConnection>(new MeliConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MeliUserId = meliUserId,
            Nickname = nickname.Trim(),
            SiteId = string.IsNullOrWhiteSpace(siteId) ? "MLA" : siteId.Trim().ToUpperInvariant(),
            AccessTokenEnc = accessTokenEnc,
            RefreshTokenEnc = refreshTokenEnc,
            TokenExpiresAtUtc = tokenExpiresAtUtc,
            StockSyncEnabled = false,
            ConnectedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        });
    }

    /// <summary>Re-conexión o refresh: reemplaza el par de tokens completo.</summary>
    public void UpdateTokens(long meliUserId, string nickname, string siteId,
        string accessTokenEnc, string refreshTokenEnc, DateTime tokenExpiresAtUtc)
    {
        MeliUserId = meliUserId;
        if (!string.IsNullOrWhiteSpace(nickname)) Nickname = nickname.Trim();
        if (!string.IsNullOrWhiteSpace(siteId)) SiteId = siteId.Trim().ToUpperInvariant();
        AccessTokenEnc = accessTokenEnc;
        RefreshTokenEnc = refreshTokenEnc;
        TokenExpiresAtUtc = tokenExpiresAtUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Marca la conexión como de demostración (solo el seeder de desarrollo).</summary>
    public void MarkDemo() => IsDemo = true;

    public void SetStockSync(bool enabled, int? bufferUnits = null, bool? autoInvoice = null)
    {
        StockSyncEnabled = enabled;
        if (bufferUnits is { } buffer) StockBufferUnits = Math.Clamp(buffer, 0, 1000);
        if (autoInvoice is { } auto) AutoInvoiceEnabled = auto;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Precio hacia ML. El recargo se acota a un rango sensato: un dedazo de
    /// más no puede publicar el catálogo a diez veces su precio.
    /// </summary>
    public void SetPriceSync(bool enabled, decimal? markupPct = null)
    {
        PriceSyncEnabled = enabled;
        if (markupPct is { } pct) PriceMarkupPct = Math.Clamp(pct, -50m, 200m);
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
