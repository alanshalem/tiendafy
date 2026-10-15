using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>
/// Configuración por tienda de la integración con Correo Argentino (API MiCorreo):
/// cotización automática en el checkout + alta de envíos desde el admin.
/// Los tokens de acceso se guardan CIFRADOS (DataProtection, igual que WhatsApp
/// y Mercado Pago) — nunca se devuelven por API ni se loguean.
/// </summary>
public sealed class CorreoArgentinoConfig
{
    public const int MaxWeightGrams = 25000;
    public const int MaxSideCm = 150;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Identificador del cliente en MiCorreo (ej: "0090000025").</summary>
    public string CustomerId { get; private set; } = null!;
    public string UserTokenEncrypted { get; private set; } = null!;
    public string PasswordTokenEncrypted { get; private set; } = null!;
    /// <summary>"TEST" (homologación de MiCorreo) o "PROD".</summary>
    public string Environment { get; private set; } = "TEST";

    /// <summary>CP desde donde despacha la tienda (numérico, ej: "1704").</summary>
    public string OriginPostalCode { get; private set; } = null!;

    // Paquete por defecto POR UNIDAD: lo usan las unidades cuya variante no
    // tiene peso o medidas cargadas (CartParcelsBuilder arma un bulto por
    // unidad con lo de su variante y cae acá solo para lo que falta).
    public int DefaultWeightGrams { get; private set; }
    public int DefaultLengthCm { get; private set; }
    public int DefaultWidthCm { get; private set; }
    public int DefaultHeightCm { get; private set; }

    /// <summary>Ofrecer entrega a domicilio en el checkout.</summary>
    public bool OfferHomeDelivery { get; private set; }
    /// <summary>Ofrecer retiro en sucursal de Correo en el checkout.</summary>
    public bool OfferAgencyDelivery { get; private set; }
    /// <summary>Interruptor general: apagado, el checkout no cotiza.</summary>
    public bool Active { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private CorreoArgentinoConfig() { } // EF Core

    public static Result<CorreoArgentinoConfig> Create(
        Guid tenantId, string customerId, string userTokenEncrypted, string passwordTokenEncrypted,
        string environment, string originPostalCode,
        int defaultWeightGrams, int defaultLengthCm, int defaultWidthCm, int defaultHeightCm,
        bool offerHome, bool offerAgency, bool active)
    {
        var config = new CorreoArgentinoConfig { Id = Guid.NewGuid(), TenantId = tenantId, CreatedAtUtc = DateTime.UtcNow };
        var result = config.Apply(customerId, userTokenEncrypted, passwordTokenEncrypted, environment,
            originPostalCode, defaultWeightGrams, defaultLengthCm, defaultWidthCm, defaultHeightCm,
            offerHome, offerAgency, active);
        return result.IsFailure ? Result.Failure<CorreoArgentinoConfig>(result.Error) : config;
    }

    public Result Update(
        string customerId, string userTokenEncrypted, string passwordTokenEncrypted,
        string environment, string originPostalCode,
        int defaultWeightGrams, int defaultLengthCm, int defaultWidthCm, int defaultHeightCm,
        bool offerHome, bool offerAgency, bool active) =>
        Apply(customerId, userTokenEncrypted, passwordTokenEncrypted, environment, originPostalCode,
            defaultWeightGrams, defaultLengthCm, defaultWidthCm, defaultHeightCm, offerHome, offerAgency, active);

    private Result Apply(
        string customerId, string userTokenEncrypted, string passwordTokenEncrypted,
        string environment, string originPostalCode,
        int weight, int length, int width, int height,
        bool offerHome, bool offerAgency, bool active)
    {
        var cp = NormalizePostalCode(originPostalCode);
        if (cp is null)
            return Result.Failure(Error.Validation(
                "Correo.InvalidPostalCode", "El código postal de origen debe tener 4 dígitos (ej: 1704)."));
        if (string.IsNullOrWhiteSpace(customerId) || customerId.Trim().Length > 20)
            return Result.Failure(Error.Validation(
                "Correo.InvalidCustomerId", "Falta el customerId de MiCorreo."));
        if (string.IsNullOrEmpty(userTokenEncrypted) || string.IsNullOrEmpty(passwordTokenEncrypted))
            return Result.Failure(Error.Validation(
                "Correo.MissingCredentials", "Faltan las credenciales de la API de MiCorreo."));
        if (weight is < 1 or > MaxWeightGrams)
            return Result.Failure(Error.Validation(
                "Correo.InvalidWeight", $"El peso por unidad debe estar entre 1 y {MaxWeightGrams} gramos."));
        var dims = PackageLimits.ValidateDimensions("Correo", length, width, height, MaxSideCm);
        if (dims.IsFailure) return dims;

        CustomerId = customerId.Trim();
        UserTokenEncrypted = userTokenEncrypted;
        PasswordTokenEncrypted = passwordTokenEncrypted;
        Environment = string.Equals(environment, "PROD", StringComparison.OrdinalIgnoreCase) ? "PROD" : "TEST";
        OriginPostalCode = cp;
        DefaultWeightGrams = weight;
        DefaultLengthCm = length;
        DefaultWidthCm = width;
        DefaultHeightCm = height;
        OfferHomeDelivery = offerHome;
        OfferAgencyDelivery = offerAgency;
        Active = active;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// "B1842ZAB" → "1842", "1704" → "1704". La API de rates espera el CP
    /// numérico de 4 dígitos; el CPA con letras se acepta y se reduce.
    /// </summary>
    public static string? NormalizePostalCode(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsAsciiDigit).ToArray());
        return digits.Length == 4 ? digits : null;
    }
}

/// <summary>
/// Alta de un envío en MiCorreo desde una venta. MiCorreo no devuelve número
/// de seguimiento al importar (solo la fecha): el número lo carga el comercio
/// en la venta cuando paga el envío en la web de MiCorreo.
///
/// Sirve de guard: no se sabe si MiCorreo deduplica por <c>extOrderId</c>, así
/// que una venta se da de alta una sola vez (índice único por tienda y venta).
/// </summary>
public sealed class CorreoShipment
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    /// <summary>"D" (a domicilio) o "S" (a sucursal), como lo pide MiCorreo.</summary>
    public string DeliveryType { get; private set; } = "D";

    /// <summary>Código de la sucursal de destino, si va a sucursal.</summary>
    public string? Agency { get; private set; }

    /// <summary>La fecha de alta tal como la devolvió MiCorreo (texto, sin zona).</summary>
    public string? RemoteCreatedAt { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    private CorreoShipment() { } // EF Core

    public static CorreoShipment Create(
        Guid tenantId, Guid orderId, string deliveryType, string? agency, string? remoteCreatedAt) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            DeliveryType = deliveryType == "S" ? "S" : "D",
            Agency = Text.Clip(agency, 20),
            RemoteCreatedAt = Text.Clip(remoteCreatedAt, 40),
            CreatedAtUtc = DateTime.UtcNow,
        };
}
