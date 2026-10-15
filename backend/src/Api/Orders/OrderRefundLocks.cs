namespace Api.Orders;

/// <summary>
/// Serializa, dentro de esta instancia, los reembolsos de una misma venta: dos
/// clics seguidos no disparan dos devoluciones ni dos avisos. Entre instancias
/// lo cubre el token de concurrencia de la orden (xmin).
///
/// Es un arreglo fijo de semáforos y no uno por venta: el diccionario
/// <c>Guid → SemaphoreSlim</c> de antes sumaba una entrada por cada venta
/// reembolsada y no la soltaba nunca. Con franjas, la misma venta cae siempre
/// en el mismo semáforo (que es la garantía que importa) y la memoria no
/// crece. El costo es que dos ventas distintas que caen en la misma franja se
/// esperan entre sí; con 128 franjas y reembolsos que son de a uno, a mano,
/// eso casi no pasa y, si pasa, es una espera de un par de segundos.
/// </summary>
public sealed class OrderRefundLocks
{
    public const int Stripes = 128;

    private readonly SemaphoreSlim[] _stripes =
        [.. Enumerable.Range(0, Stripes).Select(_ => new SemaphoreSlim(1, 1))];

    /// <summary>La franja de esa venta: siempre la misma para el mismo id.</summary>
    public static int StripeOf(Guid orderId) => (orderId.GetHashCode() & int.MaxValue) % Stripes;

    /// <summary>Espera el turno de esa venta; se libera al hacer Dispose del resultado.</summary>
    public async Task<IDisposable> EnterAsync(Guid orderId, CancellationToken ct)
    {
        var gate = _stripes[StripeOf(orderId)];
        await gate.WaitAsync(ct);
        return new Release(gate);
    }

    private sealed class Release(SemaphoreSlim gate) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0) gate.Release();
        }
    }
}
