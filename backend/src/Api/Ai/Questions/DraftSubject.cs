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

/// <summary>Qué pasó con las herramientas durante una corrida; lo lee el chequeo del borrador.</summary>
public sealed class DraftToolLog
{
    public bool DeliveryEstimateKnown { get; private set; }

    internal void MarkDeliveryEstimateKnown() => DeliveryEstimateKnown = true;
}
