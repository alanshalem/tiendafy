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
        public Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(TenantId tenantId, int limit, int offset, OrderListFilter filter, CancellationToken ct = default) =>
            Task.FromResult<(IReadOnlyList<Order>, int)>(([], 0));
        public IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, OrderListFilter filter) => AsyncEnumerable.Empty<Order>();
        public Task<int> CountAsync(TenantId tenantId, OrderListFilter filter, CancellationToken ct = default) => Task.FromResult(0);
        public Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Order>>([]);
        public Task<Order?> GetByCheckoutSessionAsync(TenantId tenantId, Guid checkoutSessionId, CancellationToken ct = default) => Task.FromResult(order);
        public Task<(Order Order, bool IsNew)> AddOncePerCheckoutAsync(Order order, CancellationToken ct = default) => Task.FromResult((order, true));
        public Task AddAsync(Order order, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) { Saves++; return Task.CompletedTask; }
    }

    private sealed class FakeInventory : IInventoryService
    {
        public readonly List<Guid> Confirmed = [];
        public readonly List<Guid> Released = [];
        public readonly List<(Guid VariantId, int Quantity)> Deducted = [];
        public bool ConfirmFails;
        public int Missing;
        public Task<Result<ReservationDto?>> ReserveAsync(Guid tenantId, Guid variantId, int quantity, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<Result> ConfirmReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default)
        {
            if (ConfirmFails)
                return Task.FromResult(Result.Failure(Error.Conflict("Reservation.NotActive", "La reserva de stock ya no está activa.")));
            Confirmed.Add(reservationId);
            return Task.FromResult(Result.Success());
        }
        public Task<Result> ReleaseReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default)
        { Released.Add(reservationId); return Task.FromResult(Result.Success()); }
        public Task<Result> ExtendReservationAsync(Guid tenantId, Guid reservationId, DateTime expiresAtUtc, CancellationToken ct = default) =>
            Task.FromResult(Result.Success());
        public Task<int> DeductSaleAsync(Guid tenantId, Guid variantId, int quantity, string? reason, CancellationToken ct = default)
        { Deducted.Add((variantId, quantity)); return Task.FromResult(Missing); }
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
    public async Task Approved_con_la_reserva_vencida_descuenta_el_stock_directo()
    {
        var order = Orden(Guid.NewGuid());
        var handler = Handler(order, out _, out var inv);
        inv.ConfirmFails = true;

        var result = await handler.HandleAsync(order.Id, "approved", "pay-1");

        Assert.Equal(SettleOutcome.JustPaid, result.Value.Outcome);
        Assert.Single(inv.Released); // por si seguía activa: se suelta antes de descontar
        Assert.Equal(1, Assert.Single(inv.Deducted).Quantity);
        Assert.Null(order.ReviewNote); // alcanzó: no hay nada que revisar
    }

    [Fact]
    public async Task Approved_sin_stock_queda_pagada_y_para_revisar()
    {
        var order = Orden(Guid.NewGuid());
        var handler = Handler(order, out var repo, out var inv);
        inv.ConfirmFails = true;
        inv.Missing = 1;

        var result = await handler.HandleAsync(order.Id, "approved", "pay-1");

        Assert.Equal(SettleOutcome.JustPaid, result.Value.Outcome);
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Contains("no había stock de Producto · Única (falta 1)", order.ReviewNote);
        Assert.Contains("devolvé el pago", order.ReviewNote);
        Assert.Equal(2, repo.Saves);
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
    public async Task Webhook_de_un_pago_ya_aplicado_sin_comision_la_completa_sin_volver_a_pagarla()
    {
        // El cobro con tarjeta en la tienda (Brick) aplica el pago sin la
        // comisión; el webhook del mismo pago llega con la orden ya pagada.
        var order = Orden(Guid.NewGuid());
        order.MarkPaid("pay-1");
        var handler = Handler(order, out var repo, out var inv);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-1", amountRefunded: 0m, mpFee: 62.5m);

        Assert.Equal(SettleOutcome.NoChange, result.Value.Outcome); // los efectos de "pagada" no vuelven a correr
        Assert.Equal(6_250, order.MpFeeAmount?.AmountInMinorUnits);
        Assert.Empty(inv.Confirmed);
        Assert.Equal(1, repo.Saves);

        // Otro aviso del mismo pago, con otra comisión: no pisa la guardada.
        var again = await handler.HandleAsync(order.Id, "approved", "pay-1", mpFee: 99m);
        Assert.Equal(SettleOutcome.NoChange, again.Value.Outcome);
        Assert.Equal(6_250, order.MpFeeAmount?.AmountInMinorUnits);
        Assert.Equal(1, repo.Saves);
    }

    [Fact]
    public async Task La_comision_de_otro_pago_no_se_le_carga_a_la_orden()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        var handler = Handler(order, out var repo, out _);

        await handler.HandleAsync(order.Id, "approved", "pay-otro", mpFee: 50m);

        Assert.Null(order.MpFeeAmount);
        Assert.Equal(1, repo.Saves); // solo la nota "pagó dos veces" (ver el test de abajo)
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
    public async Task Approved_despues_de_un_rechazo_deja_la_venta_pagada_y_para_revisar()
    {
        // Checkout Pro: la primera tarjeta se rechaza (la venta queda fallida y
        // su reserva se libera) y el comprador paga con otra en el mismo link.
        var order = Orden(Guid.NewGuid());
        var handler = Handler(order, out _, out var inv);
        await handler.HandleAsync(order.Id, "rejected", "pay-rechazado");
        inv.ConfirmFails = true; // la reserva ya se liberó

        var result = await handler.HandleAsync(order.Id, "approved", "pay-ok", mpFee: 10m);

        Assert.Equal(SettleOutcome.JustPaid, result.Value.Outcome); // corren email, factura, cupón…
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Equal("pay-ok", order.PaymentId);
        Assert.NotNull(order.PaidAtUtc);
        Assert.Equal(1_000, order.MpFeeAmount?.AmountInMinorUnits);
        Assert.Contains("con el pago rechazado", order.ReviewNote);
        Assert.Single(inv.Deducted); // el stock se descuenta de nuevo

        // El aviso repetido del mismo pago no la vuelve a procesar.
        var again = await handler.HandleAsync(order.Id, "approved", "pay-ok");
        Assert.Equal(SettleOutcome.NoChange, again.Value.Outcome);
        Assert.Single(inv.Deducted);
    }

    [Fact]
    public async Task Approved_sobre_una_cancelada_sin_cobrar_la_deja_pagada_con_el_motivo()
    {
        var order = Orden();
        order.Cancel("sistema", "No se completó el pago");
        var handler = Handler(order, out _, out _);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-efectivo");

        Assert.Equal(SettleOutcome.JustPaid, result.Value.Outcome);
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Null(order.CancelledAtUtc);
        Assert.Contains("Figuraba cancelada (No se completó el pago)", order.ReviewNote);
    }

    [Fact]
    public async Task Otro_pago_aprobado_sobre_una_venta_cobrada_queda_para_revisar_una_vez()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        var handler = Handler(order, out var repo, out var inv);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-2", amountRefunded: 0m, mpFee: 5m);

        Assert.Equal(SettleOutcome.NoChange, result.Value.Outcome);
        Assert.Equal("pay-1", order.PaymentId);
        Assert.Contains("pagó dos veces", order.ReviewNote);
        Assert.Contains("#pay-2", order.ReviewNote);
        Assert.Null(order.MpFeeAmount); // la comisión de otro pago no es de esta venta
        Assert.Empty(inv.Confirmed);

        await handler.HandleAsync(order.Id, "approved", "pay-2");
        Assert.Single(order.ReviewNote!.Split('\n'));
        Assert.Equal(1, repo.Saves);

        // Y si el comercio devuelve el duplicado desde Mercado Pago, la venta no se toca.
        var refunded = await handler.HandleAsync(order.Id, "refunded", "pay-2");
        Assert.Equal(SettleOutcome.NoChange, refunded.Value.Outcome);
        Assert.Equal(OrderStatus.Paid, order.Status);
    }

    [Fact]
    public async Task Una_venta_devuelta_no_se_revive()
    {
        var order = Orden();
        order.MarkPaid("pay-1");
        order.MarkRefunded();
        var handler = Handler(order, out _, out _);

        var result = await handler.HandleAsync(order.Id, "approved", "pay-1");

        Assert.Equal(SettleOutcome.NoChange, result.Value.Outcome);
        Assert.Equal(OrderStatus.Refunded, order.Status);
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
        Assert.Equal(30_000, result.Value.RefundedNow?.AmountInMinorUnits); // el aviso al comprador dice cuánto
        Assert.Equal(1, repo.Saves);

        // mismo monto reportado de nuevo → sin cambios (y sin otro aviso)
        var again = await handler.HandleAsync(order.Id, "approved", "pay-1", amountRefunded: 300m);
        Assert.Equal(SettleOutcome.NoChange, again.Value.Outcome);
        Assert.Null(again.Value.RefundedNow);

        // Otro parcial: lo nuevo es solo la diferencia, no el acumulado.
        var second = await handler.HandleAsync(order.Id, "approved", "pay-1", amountRefunded: 450m);
        Assert.Equal(SettleOutcome.PartiallyRefunded, second.Value.Outcome);
        Assert.Equal(15_000, second.Value.RefundedNow?.AmountInMinorUnits);
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
