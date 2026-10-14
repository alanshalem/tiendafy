using System.Text;
using Api.Endpoints;
using Api.Notifications;
using Api.Workers;
using Catalog.Contracts;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Discounts.Infrastructure;
using Inventory.Contracts;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// Pago por transferencia o en efectivo al retirar: el único medio de pago que
/// no confirma una pasarela, así que el ciclo entero vive acá — la orden nace
/// pendiente con el descuento que anuncia la tienda, el stock queda guardado
/// las horas que configuró el comercio, el comercio registra el pago a mano, y
/// si nadie paga a tiempo la orden se cancela sola y el stock vuelve a la venta.
/// </summary>
public sealed class OfflinePaymentService(
    CheckoutDbContext checkoutDb,
    ICheckoutRepository checkouts,
    IShippingMethodRepository shippingMethods,
    DiscountsDbContext discountsDb,
    CreateOrderHandler createOrder,
    ICatalogCheckoutQuery catalogQuery,
    IOrderRepository orders,
    OrdersDbContext ordersDb,
    IInventoryService inventory,
    IStockRepository stock,
    OrderNotifier notifier,
    PaidOrderSideEffects paidEffects,
    ILogger<OfflinePaymentService> logger)
{
    /// <summary>
    /// Margen de la reserva de stock por encima del plazo de pago: la orden se
    /// cancela primero (y libera el stock ella misma, avisando al comprador) y
    /// recién después vencería la reserva. Si el worker de vencimientos
    /// estuviera caído, el job de reservas igual devuelve el stock.
    /// </summary>
    public static readonly TimeSpan ReservationGrace = TimeSpan.FromHours(1);

    /// <summary>Crea la orden pendiente desde un checkout enviado. Nada del monto viene del navegador.</summary>
    public async Task<Result<Order>> PlaceAsync(
        TenantId tenantId, Guid sessionId, OfflinePaymentMethod method, string? couponCode, string? utmSource,
        CancellationToken ct)
    {
        var options = await checkoutDb.PaymentOptions.AsNoTracking()
            .FirstOrDefaultAsync(o => o.TenantId == tenantId, ct);

        var session = await checkouts.GetByIdAsync(tenantId, sessionId, ct);
        if (session is null) return Result.Failure<Order>(Error.NotFound("Checkout", sessionId));

        var isPickup = session.ShippingMethodId is { } methodId
            && (await shippingMethods.GetByIdAsync(tenantId, methodId, ct))?.Kind == ShippingKind.Pickup;

        if (options is null || !options.Offers(method, isPickup))
            return Result.Failure<Order>(Error.Validation("Payment.OfflineUnavailable",
                method == OfflinePaymentMethod.Cash
                    ? "El pago en efectivo es solo para retirar en el local."
                    : "Esta tienda no está aceptando transferencias."));

        var dueAt = DateTime.UtcNow.AddHours(options.HoldHours);
        var built = await OrderEndpoints.BuildOrderAsync(
            tenantId, sessionId, couponCode, utmSource, checkouts, discountsDb, createOrder, catalogQuery,
            shippingMethods, ct, new OfflinePaymentPlan(OfflinePayments.Wire(method), options.DiscountPercent, dueAt));
        if (built.IsFailure) return built;
        var order = built.Value;

        // La reserva del checkout dura media hora (lo que tarda una tarjeta); el
        // que transfiere tiene horas. Si alguna ya no se puede estirar, la venta
        // no se sostiene: se cancela entera antes de mandarle a nadie a pagar.
        foreach (var reservationId in order.ReservationIds)
        {
            var extended = await inventory.ExtendReservationAsync(
                tenantId.Value, reservationId, dueAt + ReservationGrace, ct);
            if (extended.IsSuccess) continue;

            order.CancelUnpaid();
            await orders.SaveChangesAsync(ct);
            await ReleaseAsync(order, ct);
            return Result.Failure<Order>(Error.Conflict("Checkout.ReservationLost",
                "Se nos venció la reserva de algún producto. Volvé a empezar la compra desde el carrito."));
        }

        try
        {
            await notifier.NotifyAsync(order, "instrucciones-pago",
                OfflinePaymentEmail.Vars(order, options), ct);
        }
        catch (Exception ex)
        {
            // La venta ya está: los datos para pagar también salen en la pantalla
            // de "listo", así que un email caído no la deshace.
            logger.LogError(ex, "No salió el email con las instrucciones de pago de la orden {OrderId}.", order.Id);
        }

        return order;
    }

    /// <summary>
    /// El comercio vio la transferencia (o cobró en el mostrador): la orden pasa
    /// a pagada con todo lo que eso dispara — stock, email, factura, cupón.
    /// </summary>
    public async Task<Result<Order>> MarkPaidAsync(TenantId tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(tenantId, orderId, ct);
        if (order is null) return Result.Failure<Order>(Error.NotFound("Order", orderId));
        if (!order.IsOfflinePayment)
            return Result.Failure<Order>(Error.Conflict("Order.NotOffline",
                "Esta venta se cobra por una pasarela: el pago lo confirma ella, no se registra a mano."));
        if (order.Status == OrderStatus.Paid) return order; // doble clic: ya está

        var paid = order.MarkPaid($"manual-{order.PaymentProvider}");
        if (paid.IsFailure) return Result.Failure<Order>(paid.Error);

        try
        {
            // xmin: si el worker la canceló por vencida en el mismo instante,
            // gana el primero y este guardado falla en vez de pisarlo.
            await orders.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure<Order>(Error.Conflict("Order.Concurrent",
                "La venta cambió mientras se registraba el pago. Recargá y fijate en qué estado quedó."));
        }

        foreach (var item in order.Items.Where(i => i.ReservationId is not null))
        {
            var confirm = await inventory.ConfirmReservationAsync(tenantId.Value, item.ReservationId!.Value, ct);
            if (confirm.IsSuccess) continue;

            // La reserva ya no estaba (se pagó pasado el margen y el job de
            // vencidas devolvió esas unidades a la venta): se descuentan a mano,
            // o el stock quedaría contando mercadería que ya se vendió.
            logger.LogWarning("Reserva {ReservationId} de la orden {OrderId} no se pudo confirmar ({Error}); se descuenta el stock.",
                item.ReservationId, order.Id, confirm.Error.Code);
            await stock.AdjustAvailableAsync(tenantId, item.VariantId, -item.Quantity,
                $"Pago registrado de la venta {order.Id.ToString()[..8]}", ct);
        }

        await paidEffects.RunAsync(order, ct: ct);
        return order;
    }

    /// <summary>Cancelar desde el panel una transferencia que no va a llegar: el stock vuelve ya.</summary>
    public async Task<Result<Order>> CancelAsync(TenantId tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(tenantId, orderId, ct);
        if (order is null) return Result.Failure<Order>(Error.NotFound("Order", orderId));
        // Una orden de Mercado Pago o Payway pendiente puede cobrarse igual
        // después: cancelarla dejaría un pago entrando a una venta cancelada.
        if (!order.IsOfflinePayment)
            return Result.Failure<Order>(Error.Conflict("Order.NotOffline",
                "Solo se cancelan a mano las ventas por transferencia o efectivo."));
        if (order.Status == OrderStatus.Cancelled) return order;

        var cancelled = order.CancelUnpaid();
        if (cancelled.IsFailure) return Result.Failure<Order>(cancelled.Error);

        try
        {
            await orders.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure<Order>(Error.Conflict("Order.Concurrent",
                "La venta cambió mientras se cancelaba. Recargá y fijate en qué estado quedó."));
        }

        await ReleaseAsync(order, ct);
        await NotifyCancelledAsync(order, ct);
        return order;
    }

    /// <summary>
    /// Cancela las ventas por transferencia o efectivo cuyo plazo venció, de
    /// cualquier tienda. Cada una se reclama con un UPDATE condicional (sigue
    /// pendiente → cancelada): dos instancias del worker, o el comercio
    /// registrando el pago en el mismo segundo, nunca la procesan dos veces.
    /// </summary>
    public async Task<int> ExpireDueAsync(DateTime nowUtc, CancellationToken ct)
    {
        var due = await ordersDb.Orders.AsNoTracking()
            .Where(o => o.Status == OrderStatus.PendingPayment
                && o.PaymentDueAtUtc != null && o.PaymentDueAtUtc <= nowUtc)
            .OrderBy(o => o.PaymentDueAtUtc)
            .Select(o => o.Id)
            .Take(50)
            .ToListAsync(ct);

        var cancelled = 0;
        foreach (var id in due)
        {
            var claimed = await ordersDb.Orders
                .Where(o => o.Id == id && o.Status == OrderStatus.PendingPayment)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.Cancelled), ct);
            if (claimed != 1) continue;

            var order = await ordersDb.Orders.AsNoTracking().FirstAsync(o => o.Id == id, ct);
            await ReleaseAsync(order, ct);
            await NotifyCancelledAsync(order, ct);
            cancelled++;
            logger.LogInformation("Orden {OrderId} cancelada: venció el plazo para pagarla.", id);
        }
        return cancelled;
    }

    private async Task ReleaseAsync(Order order, CancellationToken ct)
    {
        foreach (var reservationId in order.ReservationIds)
        {
            // Si ya no estaba activa (la liberó el job de vencidas), no hay nada que devolver.
            var released = await inventory.ReleaseReservationAsync(order.TenantId.Value, reservationId, ct);
            if (released.IsFailure)
                logger.LogInformation("Reserva {ReservationId} de la orden {OrderId} ya estaba liberada.", reservationId, order.Id);
        }
    }

    private async Task NotifyCancelledAsync(Order order, CancellationToken ct)
    {
        try
        {
            await notifier.NotifyAsync(order, "cancelacion-compra", ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "No salió el aviso de cancelación de la orden {OrderId}.", order.Id);
        }
    }

    /// <summary>
    /// Lo que necesita la pantalla del comprador para pagar: cuánto, a qué
    /// cuenta o dónde, y hasta cuándo. Los datos de la cuenta son los de hoy:
    /// si el comercio los corrige, la pantalla muestra los buenos.
    /// </summary>
    public static object InstructionsDto(Order order, StorePaymentOptions? options)
    {
        var pending = order.Status == OrderStatus.PendingPayment;
        var transfer = order.PaymentProvider == "transfer" && pending && options is not null;
        return new
        {
            orderId = order.Id,
            method = order.PaymentProvider,
            status = order.Status.ToString().ToUpperInvariant(),
            total = ApiJson.MoneyJson(order.Total),
            discount = ApiJson.MoneyJson(order.PaymentMethodDiscount),
            dueAtUtc = order.PaymentDueAtUtc,
            transfer = transfer
                ? new
                {
                    bankName = options!.BankName,
                    accountHolder = options.AccountHolder,
                    holderTaxId = options.HolderTaxId,
                    cbu = options.Cbu,
                    alias = options.Alias,
                }
                : null,
            instructions = pending ? options?.Instructions : null,
            pickupAddress = order.PaymentProvider == "cash" ? order.ShippingAddress : null,
        };
    }
}

/// <summary>El bloque "cómo pagar" del email de instrucciones (HTML armado acá, con todo escapado).</summary>
public static class OfflinePaymentEmail
{
    private static string Enc(string? s) => System.Net.WebUtility.HtmlEncode(s ?? string.Empty);

    /// <summary>Hora de Argentina: el plazo se lee en la hora del comprador, no en UTC.</summary>
    public static string Local(DateTime utc) => utc.AddHours(-3).ToString("dd/MM 'a las' HH:mm");

    public static IReadOnlyDictionary<string, string> Vars(Order order, StorePaymentOptions options) =>
        new Dictionary<string, string> { ["payment_instructions"] = Block(order, options) };

    public static string Block(Order order, StorePaymentOptions options)
    {
        var sb = new StringBuilder("<div style='margin:16px 0;padding:14px 16px;border:1px solid #e5e5e5;border-radius:8px;font-size:14px'>");
        if (order.PaymentProvider == "cash")
        {
            sb.Append("<p style='margin:0 0 6px'><strong>Pagás en efectivo al retirar</strong></p>");
            if (!string.IsNullOrWhiteSpace(order.ShippingAddress))
                sb.Append("<p style='margin:0 0 6px'>Dónde: ").Append(Enc(order.ShippingAddress)).Append("</p>");
        }
        else
        {
            sb.Append("<p style='margin:0 0 8px'><strong>Datos para la transferencia</strong></p>")
              .Append("<table role='presentation' style='border-collapse:collapse;font-size:14px'>");
            Row(sb, "Monto", MoneyFormat.ForNotification(order.Total));
            Row(sb, "Titular", options.AccountHolder);
            Row(sb, "CUIT", options.HolderTaxId);
            Row(sb, "Banco", options.BankName);
            Row(sb, "CBU/CVU", options.Cbu);
            Row(sb, "Alias", options.Alias);
            sb.Append("</table>");
        }
        if (order.PaymentDueAtUtc is { } due)
            sb.Append("<p style='margin:8px 0 0;color:#8b8b8b'>Te guardamos los productos hasta el ")
              .Append(Enc(Local(due))).Append(" (hora de Argentina). Si para entonces no registramos el pago, el pedido se cancela solo.</p>");
        if (!string.IsNullOrWhiteSpace(options.Instructions))
            sb.Append("<p style='margin:8px 0 0'>").Append(Enc(options.Instructions).Replace("\n", "<br/>")).Append("</p>");
        return sb.Append("</div>").ToString();
    }

    private static void Row(StringBuilder sb, string label, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        sb.Append("<tr><td style='padding:2px 16px 2px 0;color:#8b8b8b'>").Append(label)
          .Append("</td><td style='padding:2px 0;font-weight:bold'>").Append(Enc(value)).Append("</td></tr>");
    }

    /// <summary>
    /// El mismo "cómo pagar" en texto, para la vista del pedido del comprador
    /// (página de gracias y "Seguí tu pedido", campo paymentInstructions). Null
    /// si la orden no se paga a mano o ya no está pendiente: una vez acreditado
    /// no hay nada que hacer. Los datos de la cuenta son los de hoy.
    /// </summary>
    public static object? ForOrderView(Order order, StorePaymentOptions? options)
    {
        if (!order.IsOfflinePayment || order.Status != OrderStatus.PendingPayment) return null;

        var lines = new List<string>();
        var total = MoneyFormat.ForNotification(order.Total);
        var discount = order.PaymentMethodDiscount.AmountInMinorUnits > 0
            ? $" (ya con {MoneyFormat.ForNotification(order.PaymentMethodDiscount)} de descuento)"
            : string.Empty;
        string title;
        if (order.PaymentProvider == "cash")
        {
            title = "Pagás al retirar";
            lines.Add($"Pagás {total} en efectivo cuando retirás{discount}.");
            if (!string.IsNullOrWhiteSpace(order.ShippingAddress)) lines.Add($"Dónde: {order.ShippingAddress}");
        }
        else
        {
            title = "Datos para transferir";
            lines.Add($"Transferí {total}{discount}.");
            void Add(string label, string? value)
            {
                if (!string.IsNullOrWhiteSpace(value)) lines.Add($"{label}: {value}");
            }
            Add("Titular", options?.AccountHolder);
            Add("CUIT", options?.HolderTaxId);
            Add("Banco", options?.BankName);
            Add("CBU/CVU", options?.Cbu);
            Add("Alias", options?.Alias);
        }
        if (order.PaymentDueAtUtc is { } due)
            lines.Add($"Te guardamos los productos hasta el {Local(due)} (hora de Argentina). Si para entonces no registramos el pago, el pedido se cancela solo.");
        if (!string.IsNullOrWhiteSpace(options?.Instructions))
            lines.Add(options.Instructions);
        return new { title, text = string.Join('\n', lines) };
    }

    /// <summary>Lo que muestra la vista previa del editor de emails.</summary>
    public static string Sample() =>
        "<div style='margin:16px 0;padding:14px 16px;border:1px solid #e5e5e5;border-radius:8px;font-size:14px'>" +
        "<p style='margin:0 0 8px'><strong>Datos para la transferencia</strong></p>" +
        "<table role='presentation' style='border-collapse:collapse;font-size:14px'>" +
        "<tr><td style='padding:2px 16px 2px 0;color:#8b8b8b'>Monto</td><td style='padding:2px 0;font-weight:bold'>ARS 40.843</td></tr>" +
        "<tr><td style='padding:2px 16px 2px 0;color:#8b8b8b'>Titular</td><td style='padding:2px 0;font-weight:bold'>Tu Tienda SRL</td></tr>" +
        "<tr><td style='padding:2px 16px 2px 0;color:#8b8b8b'>Alias</td><td style='padding:2px 0;font-weight:bold'>TU.TIENDA.PAGOS</td></tr>" +
        "</table><p style='margin:8px 0 0;color:#8b8b8b'>Te guardamos los productos hasta el 16/10 a las 18:30 (hora de Argentina).</p></div>";
}

/// <summary>Cancela las transferencias que no llegaron a tiempo (ver OfflinePaymentService.ExpireDueAsync).</summary>
public sealed class OfflinePaymentExpiryWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<OfflinePaymentExpiryWorker> logger) : PollingWorker(TimeSpan.FromMinutes(1))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "El vencimiento de ventas por transferencia falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<OfflinePaymentService>();
        await service.ExpireDueAsync(DateTime.UtcNow, ct);
    }
}
