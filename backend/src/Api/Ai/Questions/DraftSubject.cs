namespace Api.Ai.Questions;

/// <summary>Un mensaje del hilo, tal cual; el servicio lo redacta (<see cref="PiiRedactor"/>) antes del prompt.</summary>
public sealed record ThreadLine(bool FromSeller, string Text);

/// <summary>Lo que dijo el seguimiento y si trae fecha estimada de entrega (para el chequeo de promesas de fecha).</summary>
public sealed record TrackingInfo(string Text, bool HasDeliveryEstimate);

/// <summary>
/// Lectores de datos nuestros o de ML, ya atados (closure) al ítem o al pedido que resolvió el endpoint:
/// el modelo no elige ids. Un lector null es una herramienta que no se ofrece.
/// </summary>
public sealed record DraftReaders(
    Func<CancellationToken, Task<string>>? StockAndPrice = null,
    Func<CancellationToken, Task<string>>? TechSheet = null,
    Func<CancellationToken, Task<string>>? OrderStatus = null,
    Func<CancellationToken, Task<TrackingInfo>>? Tracking = null);

/// <summary>Sobre qué se pide el borrador: canal, hilo, contexto armado por nosotros y lectores.</summary>
public sealed record DraftSubject(
    DraftChannel Channel,
    IReadOnlyList<ThreadLine> Thread,
    string Context,
    IReadOnlyCollection<long> KnownAmountsMinor,
    DraftReaders Readers);

/// <summary>
/// Qué pasó con las herramientas durante una corrida: si se supo la fecha de entrega y qué lectores fallaron.
/// También lleva el tope de lectura de esa corrida.
/// </summary>
public sealed class DraftToolLog
{
    private readonly List<(string Tool, string ExceptionType, bool TimedOut)> _failures = [];

    public DraftToolLog() : this(TimeSpan.FromSeconds(5)) { }

    /// <summary>Para los tests: un tope corto en vez de esperar 5 segundos.</summary>
    internal DraftToolLog(TimeSpan readerTimeout) => ReaderTimeout = readerTimeout;

    /// <summary>Tope de cada lector; pasado, la herramienta responde un texto neutro.</summary>
    public TimeSpan ReaderTimeout { get; }

    public bool DeliveryEstimateKnown { get; private set; }

    /// <summary>Lectores que fallaron o se pasaron de tiempo. Sin el mensaje de la excepción: puede traer datos.</summary>
    public IReadOnlyList<(string Tool, string ExceptionType, bool TimedOut)> ReaderFailures => _failures;

    internal void MarkDeliveryEstimateKnown() => DeliveryEstimateKnown = true;

    internal void RecordReaderFailure(string tool, Exception ex) =>
        _failures.Add((tool, ex.GetType().Name, ex is OperationCanceledException));
}
