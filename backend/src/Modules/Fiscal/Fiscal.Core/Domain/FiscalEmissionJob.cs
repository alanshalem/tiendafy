using SharedKernel.Common;
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
/// (tenant, orden, tipo, clave): un mismo evento no factura dos veces la misma
/// orden. La factura es una sola por orden (clave vacía); las notas de crédito
/// pueden ser varias, una por reembolso o ajuste, cada una con su clave
/// (<see cref="CreditNoteKeys"/>).
/// </summary>
public sealed class FiscalEmissionJob
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }
    public FiscalJobKind Kind { get; private set; }

    public long GrossMinorUnits { get; private set; }
    public string? BuyerDoc { get; private set; }

    /// <summary>
    /// Qué pedido es este dentro de la orden: vacío para la factura (una sola)
    /// y para las notas de crédito de antes de que hubiera varias; para una NC,
    /// el reembolso o el pedido manual que la originó. Viaja al comprobante,
    /// así un reintento reconoce lo que ya emitió.
    /// </summary>
    public string IdempotencyKey { get; private set; } = string.Empty;

    /// <summary>Motivo que escribió el comercio (nota de crédito a mano), si escribió uno.</summary>
    public string? Reason { get; private set; }

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

    /// <param name="notBefore">
    /// Desde cuándo lo puede tomar el worker. La NC a mano se emite en el
    /// momento desde el panel: el worker espera un rato y la toma solo si el
    /// intento del panel no la terminó.
    /// </param>
    public static FiscalEmissionJob Create(
        Guid tenantId, Guid orderId, FiscalJobKind kind, long grossMinorUnits, string? buyerDoc,
        string idempotencyKey = "", string? reason = null, DateTime? notBefore = null)
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
            IdempotencyKey = idempotencyKey,
            Reason = string.IsNullOrWhiteSpace(reason) ? null : Text.Cap(reason.Trim(), 300),
            Status = FiscalJobStatus.Pending,
            Attempts = 0,
            NextAttemptUtc = notBefore ?? now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    /// <summary>La clave tal como viaja al emisor (null = la de siempre: factura o NC vieja).</summary>
    public string? RequestKey => IdempotencyKey.Length == 0 ? null : IdempotencyKey;

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
        LastError = Text.Cap(error, 1000);
        NextAttemptUtc = nextAttemptUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Dead-letter: rechazo de ARCA o se agotaron los reintentos.</summary>
    public void MarkFailed(string error)
    {
        Status = FiscalJobStatus.Failed;
        LastError = Text.Cap(error, 1000);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Quedó tomado (<see cref="FiscalJobStatus.Processing"/>) más allá del
    /// lease: el proceso que lo tenía murió a mitad de camino. Vuelve a la
    /// cola ya, y el reintento pasa por el emisor de siempre, que antes de
    /// pedir otro número reconcilia con ARCA lo que haya quedado pendiente
    /// (el pedido pudo haber salido y estar autorizado). Nunca se reemite a ciegas.
    /// </summary>
    public void ReleaseStaleLease(string reason)
    {
        Status = FiscalJobStatus.Pending;
        LastError = Text.Cap(reason, 1000);
        NextAttemptUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Vuelve a empezar de cero un job que terminó con un comprobante de otro
    /// ambiente (la factura de homologación no existe para ARCA de producción):
    /// lo hecho no cuenta, y el job es uno solo por (tienda, orden, tipo).
    /// </summary>
    public void Restart(long grossMinorUnits, string? buyerDoc)
    {
        GrossMinorUnits = grossMinorUnits;
        BuyerDoc = buyerDoc;
        Status = FiscalJobStatus.Pending;
        Attempts = 0;
        LastError = null;
        FiscalDocumentId = null;
        NextAttemptUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Reintento manual desde el admin: vuelve a la cola.</summary>
    public void Requeue()
    {
        Status = FiscalJobStatus.Pending;
        NextAttemptUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

}
