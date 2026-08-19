using SharedKernel.Common;

namespace Social.Infrastructure;

/// <summary>Estado de negocio del post (lo que ve el merchant).</summary>
public enum SocialPostStatus
{
    Draft,
    Scheduled,
    Published,
    Failed,
}

/// <summary>
/// Estado de procesamiento, ortogonal al de negocio (diseño Mixpost): sirve de
/// lock de idempotencia del publicador — el cron solo toma Pending, marca
/// Processing (la UI lo muestra como "Publicando…") y cierra en Processed.
/// </summary>
public enum SocialScheduleStatus
{
    Pending,
    Processing,
    Processed,
}

/// <summary>
/// Publicación social: un contenido base que sale a N cuentas a la vez, con
/// override opcional por cuenta (los targets guardan el resultado por red).
/// Fechas SIEMPRE en UTC; la conversión es del cliente.
/// </summary>
public sealed class SocialPost
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string Content { get; private set; } = string.Empty;

    /// <summary>JSON array de URLs de imágenes (de la biblioteca propia o del catálogo).</summary>
    public string MediaUrlsJson { get; private set; } = "[]";

    /// <summary>Cupón asociado para medir ventas del post (como las campañas de email).</summary>
    public string? CouponCode { get; private set; }

    public SocialPostStatus Status { get; private set; }
    public SocialScheduleStatus ScheduleStatus { get; private set; }

    public DateTime? ScheduledAtUtc { get; private set; }
    public DateTime? PublishedAtUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private readonly List<SocialPostTarget> _targets = [];
    public IReadOnlyList<SocialPostTarget> Targets => _targets.AsReadOnly();

    private SocialPost() { } // EF Core

    public static Result<SocialPost> Create(Guid tenantId, string? content, string mediaUrlsJson)
    {
        var trimmed = content?.Trim() ?? string.Empty;
        if (trimmed.Length == 0 && mediaUrlsJson == "[]")
            return Result.Failure<SocialPost>(Error.Validation(
                "Social.Empty", "El post necesita texto o al menos una imagen."));
        if (trimmed.Length > 10_000)
            return Result.Failure<SocialPost>(Error.Validation(
                "Social.TooLong", "El texto supera el máximo global (10.000)."));

        return new SocialPost
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Content = trimmed,
            MediaUrlsJson = mediaUrlsJson,
            Status = SocialPostStatus.Draft,
            ScheduleStatus = SocialScheduleStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }

    public bool IsEditable => Status is SocialPostStatus.Draft or SocialPostStatus.Scheduled
        && ScheduleStatus == SocialScheduleStatus.Pending;

    public Result UpdateContent(string? content, string mediaUrlsJson)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Social.NotEditable",
                "El post ya se publicó o se está publicando."));
        var trimmed = content?.Trim() ?? string.Empty;
        if (trimmed.Length == 0 && mediaUrlsJson == "[]")
            return Result.Failure(Error.Validation("Social.Empty", "El post necesita texto o al menos una imagen."));
        Content = trimmed;
        MediaUrlsJson = mediaUrlsJson;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public Result SetCoupon(string? code)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Social.NotEditable", "El post ya se publicó o se está publicando."));
        CouponCode = string.IsNullOrWhiteSpace(code) ? null : code.Trim().ToUpperInvariant();
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Reemplaza los destinos (edición: la lista viene entera del composer).</summary>
    public Result SetTargets(IReadOnlyList<(Guid AccountId, string? ContentOverride)> targets)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Social.NotEditable", "El post ya se publicó o se está publicando."));
        if (targets.Select(t => t.AccountId).Distinct().Count() != targets.Count)
            return Result.Failure(Error.Validation("Social.DuplicateTarget", "Cada cuenta va una sola vez."));

        _targets.Clear();
        foreach (var (accountId, contentOverride) in targets)
            _targets.Add(new SocialPostTarget(accountId, string.IsNullOrWhiteSpace(contentOverride) ? null : contentOverride.Trim()));
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public Result Schedule(DateTime? scheduledAtUtc)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Social.NotEditable", "El post ya se publicó o se está publicando."));
        if (_targets.Count == 0)
            return Result.Failure(Error.Validation("Social.NoTargets", "Elegí al menos una cuenta."));
        // "Publicar ahora" = agendar a now: el publicador lo toma en el próximo ciclo.
        var when = scheduledAtUtc ?? DateTime.UtcNow;
        if (when < DateTime.UtcNow.AddMinutes(-1) && scheduledAtUtc is not null)
            return Result.Failure(Error.Validation("Social.PastDate", "La fecha tiene que ser futura."));

        ScheduledAtUtc = when;
        Status = SocialPostStatus.Scheduled;
        ScheduleStatus = SocialScheduleStatus.Pending;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public Result Unschedule()
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Social.NotEditable", "El post ya se publicó o se está publicando."));
        Status = SocialPostStatus.Draft;
        ScheduledAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Claim del publicador (tras el UPDATE atómico del repo).</summary>
    public void MarkProcessing()
    {
        ScheduleStatus = SocialScheduleStatus.Processing;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Cierre: algún target con error ⇒ Failed; si no, Published.</summary>
    public void FinishProcessing()
    {
        Status = _targets.Any(t => t.Error is not null) ? SocialPostStatus.Failed : SocialPostStatus.Published;
        ScheduleStatus = SocialScheduleStatus.Processed;
        PublishedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Contenido efectivo para una cuenta: su override o el original.</summary>
    public string ContentFor(SocialPostTarget target) => target.ContentOverride ?? Content;
}

/// <summary>
/// Destino del post en UNA cuenta, con el resultado por red (diseño Mixpost:
/// acá viven el id externo, el link y el error de cada red — el fallo de una
/// no frena a las demás).
/// </summary>
public sealed class SocialPostTarget
{
    public Guid Id { get; private set; }
    public Guid AccountId { get; private set; }

    /// <summary>Texto distinto para esta red (null = usa el del post).</summary>
    public string? ContentOverride { get; private set; }

    public string? ProviderPostId { get; private set; }
    public string? ExternalUrl { get; private set; }
    public string? Error { get; private set; }
    public DateTime? PublishedAtUtc { get; private set; }

    private SocialPostTarget() { } // EF Core

    internal SocialPostTarget(Guid accountId, string? contentOverride)
    {
        Id = Guid.NewGuid();
        AccountId = accountId;
        ContentOverride = contentOverride;
    }

    public void MarkPublished(string? providerPostId, string? externalUrl)
    {
        ProviderPostId = providerPostId;
        ExternalUrl = externalUrl;
        Error = null;
        PublishedAtUtc = DateTime.UtcNow;
    }

    public void MarkFailed(string error) => Error = error.Length > 500 ? error[..500] : error;
}
