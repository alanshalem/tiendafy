using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>
/// Configuración por tienda de la integración con Zipnova (API v2): cotización
/// en el checkout + creación de envíos y etiquetas desde el admin.
/// API Token y Secret se guardan CIFRADOS (DataProtection) — nunca se
/// devuelven por API ni se loguean. El host depende del país de la cuenta.
/// </summary>
public sealed class ZipnovaConfig
{
    // Límites del contrato de Zipnova (spec 04 §2.6): peso en gramos 10..10M,
    // dimensiones 1..5000 cm. Acá se acota a valores razonables de e-commerce.
    public const int MinWeightGrams = 10;
    public const int MaxWeightGrams = 10_000_000;
    public const int MaxSideCm = 500;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string ApiTokenEncrypted { get; private set; } = null!;
    public string ApiSecretEncrypted { get; private set; } = null!;
    /// <summary>"AR" | "CL" | "MX" — define el host de la API.</summary>
    public string Country { get; private set; } = "AR";
    /// <summary>ID de la cuenta Zipnova (unidad de facturación).</summary>
    public int AccountId { get; private set; }
    /// <summary>ID del origen en el address book, o "auto" (default de la cuenta).</summary>
    public string OriginId { get; private set; } = "auto";

    // Paquete estimado POR UNIDAD del carrito, en CM. Todos los endpoints de
    // Zipnova esperan centímetros (confirmado por su soporte, jul-2026).
    public int DefaultWeightGrams { get; private set; }
    public int DefaultLengthCm { get; private set; }
    public int DefaultWidthCm { get; private set; }
    public int DefaultHeightCm { get; private set; }

    /// <summary>Interruptor general: apagado, el checkout no cotiza con Zipnova.</summary>
    public bool Active { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private ZipnovaConfig() { } // EF Core

    public static Result<ZipnovaConfig> Create(
        Guid tenantId, string apiTokenEncrypted, string apiSecretEncrypted,
        string country, int accountId, string? originId,
        int defaultWeightGrams, int defaultLengthCm, int defaultWidthCm, int defaultHeightCm,
        bool active)
    {
        var config = new ZipnovaConfig { Id = Guid.NewGuid(), TenantId = tenantId, CreatedAtUtc = DateTime.UtcNow };
        var result = config.Apply(apiTokenEncrypted, apiSecretEncrypted, country, accountId, originId,
            defaultWeightGrams, defaultLengthCm, defaultWidthCm, defaultHeightCm, active);
        return result.IsFailure ? Result.Failure<ZipnovaConfig>(result.Error) : config;
    }

    public Result Update(
        string apiTokenEncrypted, string apiSecretEncrypted, string country, int accountId, string? originId,
        int defaultWeightGrams, int defaultLengthCm, int defaultWidthCm, int defaultHeightCm, bool active) =>
        Apply(apiTokenEncrypted, apiSecretEncrypted, country, accountId, originId,
            defaultWeightGrams, defaultLengthCm, defaultWidthCm, defaultHeightCm, active);

    private Result Apply(
        string apiTokenEncrypted, string apiSecretEncrypted, string country, int accountId, string? originId,
        int weight, int length, int width, int height, bool active)
    {
        if (string.IsNullOrEmpty(apiTokenEncrypted) || string.IsNullOrEmpty(apiSecretEncrypted))
            return Result.Failure(Error.Validation(
                "Zipnova.MissingCredentials", "Faltan el API Token y el API Secret de Zipnova."));

        var normalizedCountry = country?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalizedCountry is not ("AR" or "CL" or "MX"))
            return Result.Failure(Error.Validation(
                "Zipnova.InvalidCountry", "El país debe ser AR, CL o MX."));

        if (accountId <= 0)
            return Result.Failure(Error.Validation(
                "Zipnova.InvalidAccountId", "Falta el ID de cuenta de Zipnova (número que ves en tu panel)."));

        var origin = string.IsNullOrWhiteSpace(originId) ? "auto" : originId.Trim();
        if (origin != "auto" && !int.TryParse(origin, out _))
            return Result.Failure(Error.Validation(
                "Zipnova.InvalidOrigin", "El origen debe ser el ID numérico del address book o \"auto\"."));

        if (weight is < MinWeightGrams or > MaxWeightGrams)
            return Result.Failure(Error.Validation(
                "Zipnova.InvalidWeight", $"El peso por unidad debe estar entre {MinWeightGrams} y {MaxWeightGrams} gramos."));
        if (length is < 1 or > MaxSideCm || width is < 1 or > MaxSideCm || height is < 1 or > MaxSideCm)
            return Result.Failure(Error.Validation(
                "Zipnova.InvalidDimensions", $"Cada dimensión debe estar entre 1 y {MaxSideCm} cm."));

        ApiTokenEncrypted = apiTokenEncrypted;
        ApiSecretEncrypted = apiSecretEncrypted;
        Country = normalizedCountry;
        AccountId = accountId;
        OriginId = origin;
        DefaultWeightGrams = weight;
        DefaultLengthCm = length;
        DefaultWidthCm = width;
        DefaultHeightCm = height;
        Active = active;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }
}

/// <summary>
/// Envío creado en Zipnova para una orden. Cumple DOS roles: guard de
/// idempotencia local (la API de Zipnova NO deduplica — un reintento crea un
/// envío real duplicado con costo) y acceso persistente a tracking/etiqueta.
/// </summary>
public sealed class ZipnovaShipment
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }
    /// <summary>ID del envío en Zipnova — la clave para etiqueta/tracking/cancelación.</summary>
    public long ShipmentId { get; private set; }
    public string? CarrierName { get; private set; }
    public string? CarrierTrackingId { get; private set; }
    /// <summary>URL de seguimiento público en la plataforma Zipnova.</summary>
    public string? TrackingUrl { get; private set; }
    public string Status { get; private set; } = "new";
    public DateTime CreatedAtUtc { get; private set; }

    private ZipnovaShipment() { } // EF Core

    public static ZipnovaShipment Create(
        Guid tenantId, Guid orderId, long shipmentId,
        string? carrierName, string? carrierTrackingId, string? trackingUrl, string? status) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            ShipmentId = shipmentId,
            CarrierName = Clip(carrierName, 120),
            CarrierTrackingId = Clip(carrierTrackingId, 80),
            TrackingUrl = Clip(trackingUrl, 500),
            Status = Clip(status, 40) ?? "new",
            CreatedAtUtc = DateTime.UtcNow,
        };

    public void UpdateStatus(string? status)
    {
        if (!string.IsNullOrWhiteSpace(status)) Status = Clip(status, 40)!;
    }

    private static string? Clip(string? v, int max)
    {
        var t = v?.Trim();
        return string.IsNullOrEmpty(t) ? null : t[..Math.Min(max, t.Length)];
    }
}
