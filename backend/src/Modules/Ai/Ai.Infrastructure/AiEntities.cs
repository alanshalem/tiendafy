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
        if (monthlyBudgetMicroUsd < 0)
            throw new ArgumentOutOfRangeException(nameof(monthlyBudgetMicroUsd));
        if (alertThresholdPct is < 1 or > 100)
            throw new ArgumentOutOfRangeException(nameof(alertThresholdPct));
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

/// <summary>Un trabajo masivo de redacción de catálogo.</summary>
public sealed class AiCatalogJob
{
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
}

/// <summary>Un producto dentro de un trabajo de catálogo, con la propuesta de la IA.</summary>
public sealed class AiCatalogJobItem
{
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
}
