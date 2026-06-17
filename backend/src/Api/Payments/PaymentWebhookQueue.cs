using System.Threading.Channels;

namespace Api.Payments;

/// <summary>Job de webhook a procesar async (igual espíritu que ProductImportQueue).</summary>
public sealed record PaymentWebhookJob(string Type, string DataId, long UserId);

/// <summary>Cola en memoria de webhooks de MercadoPago. El endpoint responde 200 y encola.</summary>
public sealed class PaymentWebhookQueue
{
    private readonly Channel<PaymentWebhookJob> _channel = Channel.CreateUnbounded<PaymentWebhookJob>();

    public ValueTask EnqueueAsync(PaymentWebhookJob job, CancellationToken ct = default) =>
        _channel.Writer.WriteAsync(job, ct);

    public IAsyncEnumerable<PaymentWebhookJob> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
