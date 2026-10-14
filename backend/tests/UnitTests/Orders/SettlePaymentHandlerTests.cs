using Inventory.Contracts;
using Microsoft.Extensions.Logging.Abstractions;
using Orders.Core.Domain;
using Orders.Core.Features;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Orders;

/// <summary>
/// El handler que aplica el resultado del pago de MP a la orden — EL camino de
/// la plata. Idempotencia (webhooks duplicados), confirmación/liberación de
/// reservas de stock, y sync de reembolsos parciales hechos en el panel de MP.
/// </summary>
public class SettlePaymentHandlerTests
{

    private sealed class FakeOrderRepo(Order? order) : IOrderRepository
    {
        public int Saves;
        public Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) => Task.FromResult(order);
        public Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default) => Task.FromResult(order);
        public Task<Order?> GetByNumberAsync(TenantId tenantId, int number, CancellationToken ct = default) => Task.FromResult(order);
        public Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Order>>([]);
        public Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(TenantId tenantId, int limit, int offset, string? search, string? status, CancellationToken ct = default) =>
            Task.FromResult<(IReadOnlyList<Order>, int)>(([], 0));
        public IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, string? search, string? status) => AsyncEnumerable.Empty<Order>();
        public Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Order>>([]);
        public Task AddAsync(Order order, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) { Saves++; return Task.CompletedTask; }
    }

    private sealed class FakeInventory : IInventoryService
    {
        public readonly List<Guid> Confirmed = [];
        public readonly List<Guid> Released = [];
        public Task<Result<ReservationDto>> ReserveAsync(Guid tenantId, Guid variantId, int quantity, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<StockDto>> GetStockAsync(Guid tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<StockDto>>([]);
        public Task<Result> ConfirmReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default)
        { Confirmed.Add(reservationId); return Task.FromResult(Result.Success()); }
        public Task<Result> ReleaseReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default)
        { Released.Add(reservationId); return Task.FromResult(Result.Success()); }
        public Task<Result> ExtendReservationAsync(Guid tenantId, Guid reservationId, DateTime expiresAtUtc, CancellationToken ct = default) =>
            Task.FromResult(Result.Success());
    }

    private static Order Orden(Guid? reserva = null)
    {
        return Order.Create(
            Tenant, Guid.NewGuid(), "cliente@test.com", "ARS",
            [(Guid.NewGuid(), "Producto", "Única", "SKU-1", new Money(100_000, "ARS"), 1, reserva, null)]).Value;
    }

    private static SettlePaymentHandler Handler(Order? order, out FakeOrderRepo repo, out FakeInventory inv)
    {
        repo = new FakeOrderRepo(order);
        inv = new FakeInventory();
        return new SettlePaymentHandler(repo, inv, NullLogger<SettlePaymentHandler>.Instance);
    }

    [Fact]
    public async Task Approved_marca_pagada_y_confirma_las_reservas_de_stock()
    {
        var reserva = Guid.NewGuid();
        var order = Orden(reserva);
        var handler = Handler(order, out var repo, out var inv);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-123");

        Assert.Equal(SettleOutcome.JustPaid, result.Value.Outcome);
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Equal("pay-123", order.PaymentId);
        Assert.Equal([reserva], inv.Confirmed);
        Assert.Equal(1, repo.Saves);
    }

    [Fact]
    public async Task Webhook_approved_duplicado_es_idempotente_no_reconfirma_stock()
    {
        var order = Orden(Guid.NewGuid());
        order.MarkPaid("pay-1"); // ya pagada por el primer webhook
        var handler = Handler(order, out var repo, out var inv);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-1");

        Assert.Equal(SettleOutcome.NoChange, result.Value.Outcome);
        Assert.Empty(inv.Confirmed); // NO doble-confirma reservas
        Assert.Equal(0, repo.Saves);
    }

    [Fact]
    public async Task Rejected_marca_fallida_y_libera_las_reservas()
    {
        var reserva = Guid.NewGuid();
        var order = Orden(reserva);
        var handler = Handler(order, out _, out var inv);

        var result = await handler.HandleAsync(order.Id, "rejected", "pay-9");

        Assert.Equal(SettleOutcome.Failed, result.Value.Outcome);
        Assert.Equal(OrderStatus.Failed, order.Status);
        Assert.Equal([reserva], inv.Released); // el stock vuelve
    }

    [Fact]
    public async Task Refunded_total_marca_reembolsada_solo_si_estaba_pagada()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        var handler = Handler(order, out _, out _);

        var result = await handler.HandleAsync(order.Id, "refunded", "pay-1");
        Assert.Equal(SettleOutcome.Refunded, result.Value.Outcome);
        Assert.Equal(OrderStatus.Refunded, order.Status);

        // segunda vez: sin cambios (idempotente)
        var again = await handler.HandleAsync(order.Id, "refunded", "pay-1");
        Assert.Equal(SettleOutcome.NoChange, again.Value.Outcome);
    }

    [Fact]
    public async Task Refund_parcial_hecho_en_el_panel_de_MP_se_sincroniza()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        var handler = Handler(order, out var repo, out _);

        // MP reporta approved con transaction_amount_refunded = $300 (total $1000)
        var result = await handler.HandleAsync(order.Id, "approved", "pay-1", amountRefunded: 300m);

        Assert.Equal(SettleOutcome.PartiallyRefunded, result.Value.Outcome);
        Assert.Equal(OrderStatus.PartiallyRefunded, order.Status);
        Assert.Equal(30_000, order.RefundedAmount.AmountInMinorUnits);
        Assert.Equal(1, repo.Saves);

        // mismo monto reportado de nuevo → sin cambios
        var again = await handler.HandleAsync(order.Id, "approved", "pay-1", amountRefunded: 300m);
        Assert.Equal(SettleOutcome.NoChange, again.Value.Outcome);
    }

    [Fact]
    public async Task Charged_back_marca_contracargo_y_pending_no_toca_nada()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        var handler = Handler(order, out _, out _);

        var cb = await handler.HandleAsync(order.Id, "charged_back", "pay-1");
        Assert.Equal(SettleOutcome.ChargedBack, cb.Value.Outcome);
        Assert.Equal(OrderStatus.ChargedBack, order.Status);

        var pendiente = Orden();
        var h2 = Handler(pendiente, out var repo2, out _);
        var res = await h2.HandleAsync(pendiente.Id, "in_process", null);
        Assert.Equal(SettleOutcome.NoChange, res.Value.Outcome);
        Assert.Equal(OrderStatus.PendingPayment, pendiente.Status);
        Assert.Equal(0, repo2.Saves);
    }

    [Fact]
    public async Task Orden_inexistente_devuelve_NotFound()
    {
        var handler = Handler(null, out _, out _);
        var result = await handler.HandleAsync(Guid.NewGuid(), "approved", "x");
        Assert.False(result.IsSuccess);
    }
}
