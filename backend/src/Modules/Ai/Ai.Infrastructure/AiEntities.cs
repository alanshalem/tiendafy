namespace Ai.Infrastructure;

/// <summary>
/// Clave de API de un proveedor de IA para una tienda. La clave vive cifrada
/// (DataProtection, purpose <c>Tiendafy.Ai.Keys.v1</c>) y nunca sale en una
/// respuesta: solo se muestran los últimos 4 caracteres.
/// </summary>
public sealed class AiProviderCredential
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public AiProvider Provider { get; private set; }
    public string KeyEncrypted { get; private set; } = "";
    public string Last4 { get; private set; } = "";
    public bool? LastTestOk { get; private set; }
    public DateTime? LastTestAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private AiProviderCredential() { } // EF Core

    public static AiProviderCredential Create(Guid tenantId, AiProvider provider, string keyEncrypted, string last4)
    {
        Validate(keyEncrypted, last4);
        return new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Provider = provider,
            KeyEncrypted = keyEncrypted,
            Last4 = last4,
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }

    public void ReplaceKey(string keyEncrypted, string last4)
    {
        Validate(keyEncrypted, last4);
        KeyEncrypted = keyEncrypted;
        Last4 = last4;
        // La prueba anterior era de la clave vieja.
        LastTestOk = null;
        LastTestAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void RecordTest(bool ok, DateTime atUtc)
    {
        LastTestOk = ok;
        LastTestAtUtc = atUtc;
    }

    private static void Validate(string keyEncrypted, string last4)
    {
        if (string.IsNullOrWhiteSpace(keyEncrypted))
            throw new ArgumentException("La clave cifrada no puede estar vacía.", nameof(keyEncrypted));
        if (string.IsNullOrWhiteSpace(last4))
            throw new ArgumentException("Los últimos 4 caracteres no pueden estar vacíos.", nameof(last4));
    }
}

/// <summary>Qué modelo hace cada tarea de IA en una tienda, y cuál lo reemplaza si falla.</summary>
public sealed class AiTaskAssignment
{
    public Guid TenantId { get; private set; }
    public AiTask Task { get; private set; }
    public string PrimaryModel { get; private set; } = "";
    public string? FallbackModel { get; private set; }

    private AiTaskAssignment() { } // EF Core

    public static AiTaskAssignment Create(Guid tenantId, AiTask task, string primary, string? fallback)
    {
        var assignment = new AiTaskAssignment { TenantId = tenantId, Task = task };
        assignment.Set(primary, fallback);
        return assignment;
    }

    public void Set(string primary, string? fallback)
    {
        if (string.IsNullOrWhiteSpace(primary))
            throw new ArgumentException("El modelo principal es obligatorio.", nameof(primary));
        PrimaryModel = primary.Trim();
        FallbackModel = string.IsNullOrWhiteSpace(fallback) ? null : fallback.Trim();
    }
}

/// <summary>Interruptor y presupuesto mensual de IA de una tienda. Apagada de fábrica.</summary>
public sealed class AiSettings
{
    public const int DefaultAlertThresholdPct = 80;

    public Guid TenantId { get; private set; }
    public bool Enabled { get; private set; }

    /// <summary>Tope del mes calendario (hora Argentina) en micro-dólares. 0 = sin presupuesto cargado.</summary>
    public long MonthlyBudgetMicroUsd { get; private set; }

    public int AlertThresholdPct { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private AiSettings() { } // EF Core

    public static AiSettings CreateDefault(Guid tenantId) => new()
    {
        TenantId = tenantId,
        Enabled = false,
        MonthlyBudgetMicroUsd = 0,
        AlertThresholdPct = DefaultAlertThresholdPct,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Update(bool enabled, long monthlyBudgetMicroUsd, int alertThresholdPct)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(monthlyBudgetMicroUsd);
        ArgumentOutOfRangeException.ThrowIfLessThan(alertThresholdPct, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(alertThresholdPct, 100);
        Enabled = enabled;
        MonthlyBudgetMicroUsd = monthlyBudgetMicroUsd;
        AlertThresholdPct = alertThresholdPct;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>Una llamada a un modelo: tokens y costo en micro-dólares. Es el libro del consumo.</summary>
public sealed class AiUsage
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public AiTask Task { get; set; }
    public AiProvider Provider { get; set; }
    public string Model { get; set; } = "";
    public Guid RunId { get; set; }
    public long InputTokens { get; set; }
    public long CachedInputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CostMicroUsd { get; set; }
    public AiOutcome Outcome { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>
/// Un trabajo masivo de redacción de catálogo. Las transiciones inválidas lanzan
/// <see cref="InvalidOperationException"/>: el servicio las valida antes y contesta un 409 explicado,
/// esto es la red.
/// </summary>
public sealed class AiCatalogJob
{
    public const int MaxItems = 500;

    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid CreatedBy { get; set; }
    public AiCatalogJobStatus Status { get; set; }
    public int Total { get; set; }
    public int Processed { get; set; }
    public long EstimatedCostMicroUsd { get; set; }
    public long ActualCostMicroUsd { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>En cola, corriendo o pausado: ocupa el único lugar de trabajo que tiene la tienda.</summary>
    public bool IsActive => Status is AiCatalogJobStatus.Queued or AiCatalogJobStatus.Running
        or AiCatalogJobStatus.PausedBudget or AiCatalogJobStatus.PausedUnavailable;

    public static AiCatalogJob Create(Guid tenantId, Guid createdBy, int total, long estimatedCostMicroUsd, DateTime nowUtc)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(total, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(total, MaxItems);
        ArgumentOutOfRangeException.ThrowIfNegative(estimatedCostMicroUsd);
        return new AiCatalogJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            CreatedBy = createdBy,
            Status = AiCatalogJobStatus.Queued,
            Total = total,
            EstimatedCostMicroUsd = estimatedCostMicroUsd,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    public void Start(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.Running, AiCatalogJobStatus.Queued);

    public void PauseForBudget(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.PausedBudget, AiCatalogJobStatus.Running);

    public void PauseUnavailable(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.PausedUnavailable, AiCatalogJobStatus.Running);

    /// <summary>De una pausa a corriendo; desde <c>Done</c> reabre el trabajo porque un ítem volvió a la cola.</summary>
    public void Resume(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.Running,
        AiCatalogJobStatus.PausedBudget, AiCatalogJobStatus.PausedUnavailable, AiCatalogJobStatus.Done);

    public void Finish(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.Done, AiCatalogJobStatus.Running);

    public void Cancel(DateTime nowUtc) => Move(nowUtc, AiCatalogJobStatus.Cancelled,
        AiCatalogJobStatus.Queued, AiCatalogJobStatus.Running, AiCatalogJobStatus.PausedBudget, AiCatalogJobStatus.PausedUnavailable);

    private void Move(DateTime nowUtc, AiCatalogJobStatus to, params AiCatalogJobStatus[] from)
    {
        if (!from.Contains(Status))
            throw new InvalidOperationException($"Un trabajo {Status} no puede pasar a {to}.");
        Status = to;
        UpdatedAtUtc = nowUtc;
    }
}

/// <summary>
/// Un producto dentro de un trabajo de catálogo. <see cref="ProposalJson"/> es el estado de trabajo del
/// ítem (paso, categoría, propuesta, intentos del evaluador…): se guarda al terminar cada paso para que
/// un reinicio retome sin repetir trabajo. Transición inválida → <see cref="InvalidOperationException"/>.
/// </summary>
public sealed class AiCatalogJobItem
{
    private const int MaxNotesLength = 2000;

    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid JobId { get; set; }
    public Guid ProductId { get; set; }
    public AiCatalogItemStatus Status { get; set; }
    public string? ProposalJson { get; set; }
    public int? JudgeScore { get; set; }
    public string? JudgeNotes { get; set; }
    public int Attempts { get; set; }
    public DateTime? ClaimedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public static AiCatalogJobItem Create(Guid tenantId, Guid jobId, Guid productId, DateTime nowUtc) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        JobId = jobId,
        ProductId = productId,
        Status = AiCatalogItemStatus.Pending,
        Attempts = 0,
        UpdatedAtUtc = nowUtc,
    };

    /// <summary>Guarda el paso. Sigue pendiente y reclamado (se renueva el reclamo).</summary>
    public void Checkpoint(string stateJson, int attempts, DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Pending);
        ProposalJson = stateJson;
        Attempts = attempts;
        ClaimedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>La categoría de ML no es clara: espera que una persona la elija. Libera el reclamo.</summary>
    public void ToNeedsCategory(string stateJson, DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Pending);
        Settle(AiCatalogItemStatus.NeedsCategory, stateJson, nowUtc);
    }

    public void ToReview(string stateJson, int attempts, int? judgeScore, string? judgeNotes, DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Pending);
        Attempts = attempts;
        JudgeScore = judgeScore;
        JudgeNotes = judgeNotes is { Length: > MaxNotesLength } ? judgeNotes[..MaxNotesLength] : judgeNotes;
        Settle(AiCatalogItemStatus.Review, stateJson, nowUtc);
    }

    public void Fail(string stateJson, DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Pending);
        Settle(AiCatalogItemStatus.Failed, stateJson, nowUtc);
    }

    /// <summary>La persona eligió la categoría: vuelve a la cola desde cero intentos.</summary>
    public void Requeue(string stateJson, DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.NeedsCategory);
        Attempts = 0;
        Settle(AiCatalogItemStatus.Pending, stateJson, nowUtc);
    }

    /// <summary>Suelta el reclamo sin tocar nada más (límite de ML, tope de IA): otra pasada lo retoma.</summary>
    public void ReleaseClaim() => ClaimedAtUtc = null;

    public void Approve(DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Review);
        Status = AiCatalogItemStatus.Approved;
        UpdatedAtUtc = nowUtc;
    }

    public void Discard(DateTime nowUtc)
    {
        Require(AiCatalogItemStatus.Review, AiCatalogItemStatus.NeedsCategory, AiCatalogItemStatus.Failed);
        Status = AiCatalogItemStatus.Discarded;
        UpdatedAtUtc = nowUtc;
    }

    private void Settle(AiCatalogItemStatus to, string stateJson, DateTime nowUtc)
    {
        Status = to;
        ProposalJson = stateJson;
        ClaimedAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    private void Require(params AiCatalogItemStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new InvalidOperationException($"Un ítem {Status} no admite este cambio.");
    }
}
