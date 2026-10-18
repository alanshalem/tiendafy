using SharedKernel.Common;

namespace Payments.Core.Domain;

public enum PaywayEnvironment
{
    Sandbox = 0,
    Production = 1,
}

/// <summary>
/// Credenciales de Payway (ex Decidir) de una tienda. Una por tenant.
///
/// Payway no tiene OAuth: el comercio recibe de Payway un número de comercio
/// (<see cref="SiteId"/>) y un par de claves. La pública se usa desde el
/// navegador para tokenizar la tarjeta —esa es toda su función y por eso puede
/// salir al browser—; la privada cobra, y por eso se guarda cifrada y no sale
/// nunca de acá.
/// </summary>
public sealed class PaywayConnection
{
    /// <summary>Host de la API v2 por ambiente.</summary>
    public const string SandboxBaseUrl = "https://developers.decidir.com/api/v2";

    /// <summary>
    /// Los propios SDKs de Payway no coinciden en el host productivo: el de
    /// Shopify y el .NET usan live.decidir.com, el de Node y el de Java usan
    /// ventasonline.payway.com.ar. Se toma el primero porque es el que corre en
    /// producción en más integraciones, y queda <see cref="BaseUrlOverride"/>
    /// para corregirlo sin deploy cuando Payway confirme cuál va.
    /// </summary>
    public const string ProductionBaseUrl = "https://live.decidir.com/api/v2";

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    /// <summary>Número de comercio que asigna Payway.</summary>
    public string SiteId { get; private set; } = string.Empty;

    public PaywayEnvironment Environment { get; private set; }

    /// <summary>
    /// Clave pública. NO es un secreto: su único uso es tokenizar la tarjeta
    /// desde el navegador, y para eso tiene que viajar hasta ahí.
    /// </summary>
    public string PublicKey { get; private set; } = string.Empty;

    /// <summary>Clave privada cifrada (Data Protection). Solo la usa el backend para cobrar.</summary>
    public string PrivateKeyEncrypted { get; private set; } = string.Empty;

    /// <summary>Host alternativo de la API. Vacío = el que corresponde al ambiente.</summary>
    public string? BaseUrlOverride { get; private set; }

    /// <summary>Nombre que ve el comprador en el resumen de la tarjeta.</summary>
    public string? EstablishmentName { get; private set; }

    /// <summary>Cuotas que se ofrecen en el checkout. Vacío = solo 1 pago.</summary>
    private readonly List<int> _installmentOptions = [1];
    public IReadOnlyList<int> InstallmentOptions => _installmentOptions.AsReadOnly();

    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private PaywayConnection() { } // EF Core

    public static Result<PaywayConnection> Create(
        TenantId tenantId, string? siteId, PaywayEnvironment environment,
        string? publicKey, string privateKeyEncrypted)
    {
        var validation = Validate(siteId, publicKey, privateKeyEncrypted);
        if (validation.IsFailure) return Result.Failure<PaywayConnection>(validation.Error);

        var now = DateTime.UtcNow;
        return new PaywayConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SiteId = siteId!.Trim(),
            Environment = environment,
            PublicKey = publicKey!.Trim(),
            PrivateKeyEncrypted = privateKeyEncrypted,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    /// <summary>
    /// Actualiza las credenciales. La privada es opcional: al editar desde el
    /// panel no se muestra la que está guardada, así que dejarla vacía significa
    /// "no la cambies", no "borrala".
    /// </summary>
    public Result Update(
        string? siteId, PaywayEnvironment environment, string? publicKey,
        string? privateKeyEncrypted, string? baseUrlOverride, string? establishmentName,
        IReadOnlyList<int>? installmentOptions)
    {
        var validation = Validate(siteId, publicKey, privateKeyEncrypted ?? PrivateKeyEncrypted);
        if (validation.IsFailure) return validation;

        if (!string.IsNullOrWhiteSpace(baseUrlOverride))
        {
            // Solo HTTPS: por acá viajan las claves que cobran.
            if (!Uri.TryCreate(baseUrlOverride, UriKind.Absolute, out var parsed))
                return Result.Failure(Error.Validation("Payway.BadBaseUrl", "El host alternativo no es una URL válida."));
            if (parsed.Scheme != Uri.UriSchemeHttps)
                return Result.Failure(Error.Validation("Payway.InsecureBaseUrl", "El host alternativo debe ser HTTPS."));
        }

        SiteId = siteId!.Trim();
        Environment = environment;
        PublicKey = publicKey!.Trim();
        if (!string.IsNullOrWhiteSpace(privateKeyEncrypted)) PrivateKeyEncrypted = privateKeyEncrypted;
        BaseUrlOverride = string.IsNullOrWhiteSpace(baseUrlOverride) ? null : baseUrlOverride.Trim();
        EstablishmentName = string.IsNullOrWhiteSpace(establishmentName)
            ? null
            : Text.Cap(establishmentName.Trim(), 60);

        SetInstallmentOptions(installmentOptions);
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Host efectivo de la API para esta conexión.</summary>
    public string BaseUrl =>
        string.IsNullOrWhiteSpace(BaseUrlOverride)
            ? (Environment == PaywayEnvironment.Production ? ProductionBaseUrl : SandboxBaseUrl)
            : BaseUrlOverride.TrimEnd('/');

    private void SetInstallmentOptions(IReadOnlyList<int>? options)
    {
        _installmentOptions.Clear();
        var clean = (options ?? [])
            .Where(n => n is >= 1 and <= 99)
            .Distinct()
            .OrderBy(n => n)
            .ToList();
        _installmentOptions.AddRange(clean.Count > 0 ? clean : [1]);
    }

    private static Result Validate(string? siteId, string? publicKey, string? privateKeyEncrypted)
    {
        if (string.IsNullOrWhiteSpace(siteId))
            return Result.Failure(Error.Validation("Payway.MissingSite", "Falta el número de comercio."));
        if (siteId.Trim().Length > 20)
            return Result.Failure(Error.Validation("Payway.BadSite", "El número de comercio es demasiado largo."));
        if (string.IsNullOrWhiteSpace(publicKey))
            return Result.Failure(Error.Validation("Payway.MissingPublicKey", "Falta la clave pública."));
        if (string.IsNullOrWhiteSpace(privateKeyEncrypted))
            return Result.Failure(Error.Validation("Payway.MissingPrivateKey", "Falta la clave privada."));

        return Result.Success();
    }
}
