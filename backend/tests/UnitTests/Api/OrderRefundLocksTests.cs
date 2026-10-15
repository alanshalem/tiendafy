using Api.Orders;

namespace UnitTests.Api;

/// <summary>
/// El candado de los reembolsos: dos reembolsos de la misma venta van de a uno,
/// y la memoria no crece con cada venta reembolsada.
/// </summary>
public sealed class OrderRefundLocksTests
{
    [Fact]
    public async Task Dos_reembolsos_de_la_misma_venta_van_de_a_uno()
    {
        var locks = new OrderRefundLocks();
        var orderId = Guid.NewGuid();

        var first = await locks.EnterAsync(orderId, CancellationToken.None);
        var second = locks.EnterAsync(orderId, CancellationToken.None);
        await Task.Delay(50);
        Assert.False(second.IsCompleted);

        first.Dispose();
        using (await second.WaitAsync(TimeSpan.FromSeconds(5))) { }
    }

    [Fact]
    public async Task Liberar_dos_veces_no_abre_el_turno_de_otro()
    {
        var locks = new OrderRefundLocks();
        var orderId = Guid.NewGuid();

        var turn = await locks.EnterAsync(orderId, CancellationToken.None);
        turn.Dispose();
        turn.Dispose();

        using var again = await locks.EnterAsync(orderId, CancellationToken.None);
        var waiting = locks.EnterAsync(orderId, CancellationToken.None);
        await Task.Delay(50);
        Assert.False(waiting.IsCompleted);
    }

    [Fact]
    public async Task Esperar_se_puede_cancelar()
    {
        var locks = new OrderRefundLocks();
        var orderId = Guid.NewGuid();
        using var held = await locks.EnterAsync(orderId, CancellationToken.None);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => locks.EnterAsync(orderId, cts.Token));
    }

    [Fact]
    public void La_misma_venta_cae_siempre_en_la_misma_franja_y_las_franjas_son_fijas()
    {
        var ids = Enumerable.Range(0, 10_000).Select(_ => Guid.NewGuid()).ToList();

        Assert.All(ids, id => Assert.Equal(OrderRefundLocks.StripeOf(id), OrderRefundLocks.StripeOf(new Guid(id.ToString()))));
        Assert.All(ids, id => Assert.InRange(OrderRefundLocks.StripeOf(id), 0, OrderRefundLocks.Stripes - 1));
        // Repartidas: con 10.000 ventas se usan todas las franjas.
        Assert.Equal(OrderRefundLocks.Stripes, ids.Select(OrderRefundLocks.StripeOf).Distinct().Count());
    }
}
