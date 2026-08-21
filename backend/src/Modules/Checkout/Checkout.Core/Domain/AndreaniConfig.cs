using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>
/// Configuración por tienda de la integración con Andreani.
///
/// Andreani no tiene un ambiente de pruebas abierto ni credenciales
/// autogestionadas: cada comercio negocia sus contratos y recibe usuario y
/// contraseña por el canal comercial. Un contrato equivale a una modalidad
/// (entrega a domicilio, retiro en sucursal), así que para ofrecer las dos hay
/// que tener dos y cotizar dos veces.
///
/// La contraseña se guarda CIFRADA (Data Protection) y no vuelve nunca por la
/// API. El usuario sí, porque el panel necesita mostrar cuál está configurado.
/// </summary>
public sealed class AndreaniConfig
{
    public const string ProductionBaseUrl = "https://apis.andreani.com";
    public const string QaBaseUrl = "https://apisqa.andreani.com";

    /// <summary>
    /// Coeficiente de peso aforado por cm³, en gramos.
    ///
    /// Andreani cobra por el mayor entre el peso real y el volumétrico. El
    /// valor se midió contra la API real: 9000 cm³ con 1 kg devolvió un aforo
    /// de 3150 g, o sea 0,35 g por cm³. Es un parámetro del CONTRATO, no de la
    /// API — por eso se guarda por tienda y no como constante.
    /// </summary>
    public const decimal DefaultVolumetricFactor = 0.35m;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Usuario del login. Se muestra en el panel para saber cuál está cargado.</summary>
    public string Username { get; private set; } = string.Empty;

    /// <summary>Contraseña cifrada. Solo la usa el backend para pedir el token.</summary>
    public string PasswordEncrypted { get; private set; } = string.Empty;

    /// <summary>Código de cliente que asigna Andreani (10 dígitos, sin el prefijo "CL").</summary>
    public string? ClientCode { get; private set; }

    /// <summary>Contrato de entrega a domicilio. Vacío = no se ofrece esa modalidad.</summary>
    public string? HomeDeliveryContract { get; private set; }

    /// <summary>Contrato de retiro en sucursal. Vacío = no se ofrece.</summary>
    public string? BranchPickupContract { get; private set; }

    /// <summary>Sucursal de imposición del remitente (nomenclatura, ej. "PRC").</summary>
    public string? OriginBranch { get; private set; }

    /// <summary>true = QA/homologación. Cambia el host de la API.</summary>
    public bool UseQa { get; private set; }

    /// <summary>Coeficiente de aforo del contrato, en gramos por cm³.</summary>
    public decimal VolumetricFactor { get; private set; } = DefaultVolumetricFactor;

    // Datos del remitente: van en cada orden de envío y Andreani los exige.
    public string? SenderName { get; private set; }
    public string? SenderEmail { get; private set; }
    public string? SenderDocumentType { get; private set; }
    public string? SenderDocumentNumber { get; private set; }
    public string? SenderPhone { get; private set; }
    public string? OriginStreet { get; private set; }
    public string? OriginNumber { get; private set; }
    public string? OriginCity { get; private set; }
    public string? OriginPostalCode { get; private set; }

    // Paquete estimado POR UNIDAD del carrito. Andreani trabaja en kilos y cm³.
    public int DefaultWeightGrams { get; private set; }
    public int DefaultLengthCm { get; private set; }
    public int DefaultWidthCm { get; private set; }
    public int DefaultHeightCm { get; private set; }

    /// <summary>Interruptor general: apagado, el checkout no cotiza con Andreani.</summary>
    public bool Active { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private AndreaniConfig() { } // EF Core

    public static Result<AndreaniConfig> Create(Guid tenantId, string passwordEncrypted)
    {
        if (string.IsNullOrWhiteSpace(passwordEncrypted))
            return Result.Failure<AndreaniConfig>(Error.Validation("Andreani.MissingPassword", "Falta la contraseña."));

        return new AndreaniConfig
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PasswordEncrypted = passwordEncrypted,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Actualiza la configuración. <paramref name="passwordEncrypted"/> vacío
    /// significa "dejá la que está": el panel nunca muestra la guardada, así
    /// que un campo en blanco no puede querer decir "borrala".
    /// </summary>
    public Result Update(
        string? username, string? passwordEncrypted, string? clientCode,
        string? homeDeliveryContract, string? branchPickupContract, string? originBranch,
        bool useQa, decimal? volumetricFactor,
        string? senderName, string? senderEmail, string? senderDocumentType, string? senderDocumentNumber,
        string? senderPhone, string? originStreet, string? originNumber, string? originCity,
        string? originPostalCode,
        int weightGrams, int lengthCm, int widthCm, int heightCm, bool active)
    {
        if (string.IsNullOrWhiteSpace(username))
            return Result.Failure(Error.Validation("Andreani.MissingUser", "Falta el usuario de Andreani."));

        // Sin ningún contrato no hay nada que cotizar: cada modalidad es un
        // contrato distinto y son ellos los que definen la tarifa.
        if (string.IsNullOrWhiteSpace(homeDeliveryContract) && string.IsNullOrWhiteSpace(branchPickupContract))
            return Result.Failure(Error.Validation("Andreani.MissingContract",
                "Cargá al menos un contrato (domicilio o sucursal)."));

        if (weightGrams is < 1 or > 1_000_000)
            return Result.Failure(Error.Validation("Andreani.BadWeight", "El peso por unidad debe estar entre 1 g y 1000 kg."));
        if (lengthCm is < 1 or > 200 || widthCm is < 1 or > 200 || heightCm is < 1 or > 200)
            return Result.Failure(Error.Validation("Andreani.BadDimensions", "Las medidas deben estar entre 1 y 200 cm."));

        // El campo volumenCm de la orden admite hasta 999999,999 cm³: un bulto
        // más grande que eso lo rechaza Andreani, así que se frena acá con un
        // mensaje que se entiende.
        if ((long)lengthCm * widthCm * heightCm > 999_999)
            return Result.Failure(Error.Validation("Andreani.TooBig",
                "El paquete supera el volumen máximo que acepta Andreani (aprox. 1 m³)."));

        if (volumetricFactor is { } factor && factor is <= 0 or > 10)
            return Result.Failure(Error.Validation("Andreani.BadFactor",
                "El coeficiente de aforo debe ser mayor a 0 y menor a 10."));

        Username = username.Trim();
        if (!string.IsNullOrWhiteSpace(passwordEncrypted)) PasswordEncrypted = passwordEncrypted;
        ClientCode = Text.Clip(clientCode?.Trim(), 20);
        HomeDeliveryContract = Text.Clip(homeDeliveryContract?.Trim(), 30);
        BranchPickupContract = Text.Clip(branchPickupContract?.Trim(), 30);
        OriginBranch = Text.Clip(originBranch?.Trim(), 20);
        UseQa = useQa;
        VolumetricFactor = volumetricFactor ?? DefaultVolumetricFactor;

        SenderName = Text.Clip(senderName?.Trim(), 40);
        SenderEmail = Text.Clip(senderEmail?.Trim(), 40);
        SenderDocumentType = Text.Clip(senderDocumentType?.Trim(), 10);
        SenderDocumentNumber = Text.Clip(senderDocumentNumber?.Trim(), 20);
        SenderPhone = Text.Clip(senderPhone?.Trim(), 15);
        OriginStreet = Text.Clip(originStreet?.Trim(), 40);
        OriginNumber = Text.Clip(originNumber?.Trim(), 40);
        OriginCity = Text.Clip(originCity?.Trim(), 40);
        OriginPostalCode = Text.Clip(originPostalCode?.Trim(), 12);

        DefaultWeightGrams = weightGrams;
        DefaultLengthCm = lengthCm;
        DefaultWidthCm = widthCm;
        DefaultHeightCm = heightCm;
        Active = active;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public string BaseUrl => UseQa ? QaBaseUrl : ProductionBaseUrl;

    /// <summary>Volumen de una unidad, en cm³ — la unidad que pide la API.</summary>
    public int UnitVolumeCm => DefaultLengthCm * DefaultWidthCm * DefaultHeightCm;

    /// <summary>
    /// ¿Están todos los datos del remitente para poder despachar? Cotizar no
    /// los necesita; crear la orden sí, y conviene avisar en el panel antes de
    /// que falle el primer despacho.
    /// </summary>
    public bool CanCreateShipments =>
        !string.IsNullOrWhiteSpace(SenderName)
        && !string.IsNullOrWhiteSpace(SenderEmail)
        && !string.IsNullOrWhiteSpace(SenderDocumentNumber)
        && !string.IsNullOrWhiteSpace(OriginStreet)
        && !string.IsNullOrWhiteSpace(OriginNumber)
        && !string.IsNullOrWhiteSpace(OriginCity)
        && !string.IsNullOrWhiteSpace(OriginPostalCode);
}

/// <summary>
/// Envío de Andreani generado desde una venta.
///
/// Andreani devuelve un número de seguimiento POR BULTO, no uno por envío, y
/// <b>no tiene endpoint de cancelación ni de idempotencia</b>. Por eso hay una
/// única fila por orden con índice único: si dos operadores tocan "despachar"
/// a la vez, la base frena al segundo. Un envío duplicado no se puede deshacer
/// por API y se factura igual.
/// </summary>
public sealed class AndreaniShipment
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    /// <summary>Número de seguimiento del primer bulto. Es lo que se le muestra al comprador.</summary>
    public string TrackingNumber { get; private set; } = string.Empty;

    /// <summary>Números de todos los bultos, separados por coma.</summary>
    public string? AllTrackingNumbers { get; private set; }

    /// <summary>URL de la etiqueta tal como la devolvió Andreani. No se arma a mano: el path cambió entre versiones.</summary>
    public string? LabelUrl { get; private set; }

    public string? ContractUsed { get; private set; }
    public string? BranchName { get; private set; }

    /// <summary>Estado neutral de Tiendafy (ver <see cref="AndreaniShipmentStatus"/>).</summary>
    public string Status { get; private set; } = AndreaniShipmentStatus.Created;

    /// <summary>Último estado crudo de Andreani, con su id. Para poder investigar lo que cae en desconocido.</summary>
    public string? RawStatus { get; private set; }
    public int? RawStatusId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? LastTrackedAtUtc { get; private set; }

    private AndreaniShipment() { } // EF Core

    public static AndreaniShipment Create(
        Guid tenantId, Guid orderId, string trackingNumber, IEnumerable<string> allTracking,
        string? labelUrl, string? contractUsed, string? branchName) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            TrackingNumber = Text.Clip(trackingNumber, 40) ?? string.Empty,
            AllTrackingNumbers = Text.Clip(string.Join(',', allTracking), 500),
            LabelUrl = Text.Clip(labelUrl, 500),
            ContractUsed = Text.Clip(contractUsed, 30),
            BranchName = Text.Clip(branchName, 120),
            Status = AndreaniShipmentStatus.Created,
            CreatedAtUtc = DateTime.UtcNow,
        };

    public void ApplyTracking(string neutralStatus, string? rawStatus, int? rawStatusId)
    {
        Status = neutralStatus;
        RawStatus = Text.Clip(rawStatus, 80);
        RawStatusId = rawStatusId;
        LastTrackedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>
/// Estados de envío de Tiendafy. Andreani no publica su catálogo de estados
/// —solo se conocen cuatro, sacados de ejemplos de la documentación—, así que
/// el mapeo traduce lo que se conoce y manda el resto a
/// <see cref="Unknown"/> en vez de inventar.
/// </summary>
public static class AndreaniShipmentStatus
{
    public const string Created = "CREATED";
    public const string Dispatched = "DISPATCHED";
    public const string InTransit = "IN_TRANSIT";
    public const string OutForDelivery = "OUT_FOR_DELIVERY";
    public const string DeliveryAttemptFailed = "DELIVERY_ATTEMPT_FAILED";
    public const string AvailableForPickup = "AVAILABLE_FOR_PICKUP";
    public const string Delivered = "DELIVERED";
    public const string ReturnedToSender = "RETURNED_TO_SENDER";
    public const string Unknown = "UNKNOWN";
}
