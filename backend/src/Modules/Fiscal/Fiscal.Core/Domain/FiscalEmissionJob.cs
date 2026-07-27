namespace Fiscal.Core.Domain;

/// <summary>Qué comprobante hay que emitir para el job.</summary>
public enum FiscalJobKind
{
    Invoice = 0,     // factura de la venta
    CreditNote = 1,  // nota de crédito (reembolso)
}

/// <summary>Estado del job en el outbox de emisión.</summary>
public enum FiscalJobStatus
{
    Pending = 0,     // esperando ser procesado (o reprogramado tras fallo transitorio)
    Processing = 1,  // tomado por un worker
    Done = 2,        // emitido con éxito (CAE otorgado)
    Failed = 3,      // dead-letter: rechazo de ARCA o agotó reintentos (requiere acción)
}

/// <summary>
/// Outbox de emisión: desacopla la venta (rápida) de la facturación en ARCA
/// (lenta y falible). Un trigger (pago acreditado / despacho) encola un job; el
/// FiscalEmissionWorker lo procesa con reintentos y backoff. Idempotente por
/// (tenant, orden, tipo): un mismo evento no factura dos veces la misma orden.
/// </summary>
public sealed class FiscalEmissionJob
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }
    public FiscalJobKind Kind { get; private set; }

    public long GrossMinorUnits { get; private set; }
    public string? BuyerDoc { get; private set; }

    public FiscalJobStatus Status { get; private set; }
    public int Attempts { get; private set; }
    public string? LastError { get; private set; }
    /// <summary>Cuándo puede volver a intentarse (backoff exponencial).</summary>
    public DateTime NextAttemptUtc { get; private set; }
    /// <summary>Comprobante resultante (si terminó bien).</summary>
    public Guid? FiscalDocumentId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private FiscalEmissionJob() { } // EF Core

    public static FiscalEmissionJob Create(
        Guid tenantId, Guid orderId, FiscalJobKind kind, long grossMinorUnits, string? buyerDoc)
    {
        var now = DateTime.UtcNow;
        return new FiscalEmissionJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            Kind = kind,
            GrossMinorUnits = grossMinorUnits,
            BuyerDoc = buyerDoc,
            Status = FiscalJobStatus.Pending,
            Attempts = 0,
            NextAttemptUtc = now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public void MarkProcessing()
    {
        Status = FiscalJobStatus.Processing;
        Attempts += 1;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkDone(Guid fiscalDocumentId)
    {
        Status = FiscalJobStatus.Done;
        FiscalDocumentId = fiscalDocumentId;
        LastError = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Fallo transitorio (red/TA): reprograma para más tarde.</summary>
    public void Reschedule(string error, DateTime nextAttemptUtc)
    {
        Status = FiscalJobStatus.Pending;
        LastError = Truncate(error);
        NextAttemptUtc = nextAttemptUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Dead-letter: rechazo de ARCA o se agotaron los reintentos.</summary>
    public void MarkFailed(string error)
    {
        Status = FiscalJobStatus.Failed;
        LastError = Truncate(error);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Reintento manual desde el admin: vuelve a la cola.</summary>
    public void Requeue()
    {
        Status = FiscalJobStatus.Pending;
        NextAttemptUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string Truncate(string s) => s.Length <= 1000 ? s : s[..1000];
}
