using System.Collections.Concurrent;
using Api.Auth;
using Api.Fiscal;
using Api.Notifications;
using Checkout.Core.Domain;
using Discounts.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using Payments.Contracts;
using Payments.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class OrderEndpoints
{
    // Serializa reembolsos concurrentes de la misma orden (por instancia).
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> RefundLocks = new();

    /// <summary>Tope de ventas por despacho en lote: una página del listado entra holgada.</summary>
    private const int MaxBulkOrders = 100;

    public static RouteGroupBuilder MapOrderEndpoints(this RouteGroupBuilder group)
    {
        // Pagar con Checkout Pro (redirect) → crea Order + preference MP.
        group.MapPost("/checkout/{id:guid}/pay", async (
            Guid id,
            PayCheckoutRequest request,
            ITenantContext tenant,
            ICheckoutRepository checkouts,
            DiscountsDbContext discountsDb,
            CreateOrderHandler createOrder,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery,
            IShippingMethodRepository shippingMethods,
            IOrderRepository orders,
            IMercadoPagoPaymentService mp,
            IConfiguration cfg,
            CancellationToken ct) =>
        {

            // El returnUrl (back_urls de MP) viene del cliente: validar que sea
            // un dominio propio o MP redirige al comprador post-pago a un sitio
            // de phishing. Sin URL segura, no se puede iniciar el pago.
            var baseUrl = SafeRedirect.SafeAbsoluteBase(request.ReturnUrl, cfg);
            if (baseUrl is null)
                return Error.Validation("Checkout.BadReturnUrl",
                    "La URL de retorno no es válida.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, checkouts, discountsDb, createOrder, catalogQuery, shippingMethods, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value;

            // El envío viaja como ítem más de la preference (MP no tiene campo aparte
            // en este flujo); el monto sale del snapshot de la orden, no del cliente.
            var prefItems = order.Items.Select(ToPreferenceItem).ToList();
            if (order.ShippingCost.AmountInMinorUnits > 0)
                prefItems.Add(new PreferenceItem(
                    order.ShippingMethodName is { Length: > 0 } sm ? $"Envío · {sm}" : "Envío",
                    1, order.ShippingCost.ToDecimal()));

            var prefResult = await mp.CreateCheckoutProPreferenceAsync(new CreatePreferenceRequest(
                tenant.TenantId, order.Id, order.Currency,
                prefItems,
                order.BuyerEmail,
                SuccessUrl: $"{baseUrl}/checkout/success?order={order.Id}",
                FailureUrl: $"{baseUrl}/checkout/failure?order={order.Id}",
                PendingUrl: $"{baseUrl}/checkout/pending?order={order.Id}",
                DiscountAmount: order.DiscountAmount.ToDecimal()), ct);

            if (prefResult.IsFailure) return prefResult.Error.ToProblem();

            order.AttachPreference(prefResult.Value.PreferenceId);
            await orders.SaveChangesAsync(ct);
            return Results.Ok(new { orderId = order.Id, initPoint = prefResult.Value.InitPoint });
        }).RequireTenant().RequireRateLimiting("payments");

        // Pagar on-site (Checkout API/Bricks): el front tokeniza la tarjeta.
        group.MapPost("/checkout/{id:guid}/pay-onsite", async (
            Guid id,
            PayOnsiteRequest request,
            ITenantContext tenant,
            ICheckoutRepository checkouts,
            DiscountsDbContext discountsDb,
            CreateOrderHandler createOrder,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery,
            IShippingMethodRepository shippingMethods,
            SettlePaymentHandler settle,
            IMercadoPagoPaymentService mp,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.PaymentMethodId))
                return Error.Validation("Payment.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, checkouts, discountsDb, createOrder, catalogQuery, shippingMethods, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value;

            var payResult = await mp.CreateCardPaymentAsync(new CreateCardPaymentRequest(
                tenant.TenantId, order.Id, order.Total.ToDecimal(),
                request.Token, request.PaymentMethodId, request.Installments ?? 1, request.IssuerId,
                order.BuyerEmail, request.PayerDocType, request.PayerDocNumber), ct);
            if (payResult.IsFailure) return payResult.Error.ToProblem();
            var card = payResult.Value;

            // Aplicar el resultado ya (el webhook es backup, idempotente).
            var settleResult = await settle.HandleAsync(order.Id, card.Status, card.PaymentId, ct: ct);
            if (settleResult.IsSuccess && settleResult.Value.Outcome == SettleOutcome.JustPaid && settleResult.Value.Order is not null)
                await paidEffects.RunAsync(settleResult.Value.Order, ct: ct);

            return Results.Ok(new { orderId = order.Id, status = card.Status, statusDetail = card.StatusDetail });
        }).RequireTenant().RequireRateLimiting("payments");

        // Pagar con Payway (ex Decidir): mismo camino que el on-site de Mercado
        // Pago, con dos diferencias que vienen de la API — el monto viaja en
        // centavos (que es como ya lo guarda la orden) y hay que mandarle la IP
        // real del comprador.
        group.MapPost("/checkout/{id:guid}/pay-payway", async (
            Guid id,
            PayPaywayRequest request,
            HttpContext http,
            ITenantContext tenant,
            ICheckoutRepository checkouts,
            DiscountsDbContext discountsDb,
            CreateOrderHandler createOrder,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery,
            IShippingMethodRepository shippingMethods,
            SettlePaymentHandler settle,
            IPaywayPaymentService payway,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Bin))
                return Error.Validation("Payway.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, checkouts, discountsDb, createOrder, catalogQuery, shippingMethods, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value;

            // El total sale del snapshot de la orden, nunca de lo que mande el
            // navegador, y ya está en centavos: la unidad que espera Payway.
            var payResult = await payway.ChargeAsync(new PaywayChargeRequest(
                tenant.TenantId, order.Id,
                order.Total.AmountInMinorUnits, order.Currency,
                request.Token, request.Bin.Trim(),
                Math.Clamp(request.Installments ?? 1, 1, 99),
                order.BuyerEmail,
                http.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0",
                request.CardLastFour, request.CardBrand, request.IsDebit,
                $"Pedido {order.Label}"), ct);

            if (payResult.IsFailure) return payResult.Error.ToProblem();
            var charge = payResult.Value;

            // Solo un pago aprobado toca la orden. Un "en revisión" o un estado
            // que no supimos interpretar la dejan pendiente a propósito: se
            // despacha cuando Payway confirma, no antes.
            if (charge.IsApproved && charge.ProviderPaymentId is { } paymentId)
            {
                var settleResult = await settle.HandleAsync(order.Id, "approved", paymentId, ct: ct);
                if (settleResult.IsSuccess && settleResult.Value.Outcome == SettleOutcome.JustPaid && settleResult.Value.Order is not null)
                    await paidEffects.RunAsync(settleResult.Value.Order, ct: ct);
            }

            return Results.Ok(new
            {
                orderId = order.Id,
                status = charge.Status.ToString().ToUpperInvariant(),
                authorizationCode = charge.AuthorizationCode,
                // El motivo del rechazo ya viene redactado para mostrarlo tal cual.
                message = charge.Decline?.BuyerMessage,
                retryable = charge.Decline?.IsRetryable,
            });
        }).RequireTenant().RequireRateLimiting("payments");

        // Estado de la orden — PÚBLICO pero mínimo (sin PII). Lo usa la página de
        // "gracias por tu compra" para pollear el resultado del pago sin login.
        group.MapGet("/orders/{id:guid}/status", async (
            Guid id, ITenantContext tenant, IOrderRepository orders, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            return order is null
                ? Results.NotFound()
                : Results.Ok(new { status = order.Status.ToString().ToUpperInvariant() });
        }).RequireTenant();

        // Detalle completo (con PII) — solo el comprador dueño de la orden o un
        // miembro admin de la tienda. Antes era anónimo y filtraba email/teléfono/
        // dirección/DNI a cualquiera con el id.
        group.MapGet("/orders/{id:guid}", async (
            Guid id, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            Customers.Infrastructure.CustomersDbContext customersDb, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();

            // ¿Shopper dueño de la orden?
            var customer = await Api.Shop.ShopAuth.ResolveAsync(http, customersDb, ct);
            var isOwnerShopper = customer is not null && !string.IsNullOrEmpty(customer.Email)
                && string.Equals(order.BuyerEmail, customer.Email, StringComparison.OrdinalIgnoreCase);

            // ¿Alguien del equipo que puede ver las ventas?
            var isStaff = (await http.GetAccessAsync())?.Can(Permission.OrdersRead) == true;

            if (!isOwnerShopper && !isStaff)
                return Results.NotFound(); // no revelar existencia a terceros

            return Results.Ok(ToDto(order));
        }).RequireTenant();

        // Listado del panel: página + total + búsqueda y filtro en la base. El
        // modo cursor (after) se mantiene para el escáner del depósito, que
        // recorre las ventas pendientes de despacho.
        group.MapGet("/orders", async (
            ITenantContext tenant, IOrderRepository orders, Guid? after, int? limit,
            int? offset, [AsParameters] OrderListQuery query, CancellationToken ct) =>
        {
            var take = Math.Clamp(limit ?? 20, 1, 100);
            if (after is null)
            {
                var (page, total) = await orders.ListPageAsync(
                    tenant.TenantId, take, Math.Max(0, offset ?? 0), query.ToFilter(), ct);
                return Results.Ok(new { items = page.Select(ToDto), total });
            }

            var items = await orders.ListAsync(tenant.TenantId, take, after, ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        }).RequirePermission(Permission.OrdersRead);

        // El listado entero (con la misma búsqueda y los mismos filtros que la
        // pantalla) como planilla. Se escribe a medida que sale de la base: no
        // tiene el tope de 100 del listado ni junta miles de ventas en memoria.
        // Con ids= baja solo esas (las elegidas en la tabla).
        group.MapGet("/orders/export", (
            ITenantContext tenant, IOrderRepository orders, [AsParameters] OrderListQuery query, CancellationToken ct) =>
            Api.Fiscal.VatBookCsv.Download(
                $"ventas-{DateTime.UtcNow.AddHours(-3):yyyy-MM-dd}.csv",
                Api.Orders.OrderCsv.Header,
                orders.StreamAsync(tenant.TenantId, query.ToFilter()).Select(Api.Orders.OrderCsv.Row),
                ct))
            .RequirePermission(Permission.OrdersRead);

        // Cancelar una venta que nunca se cobró: el link de pago que no se
        // pagó, el pedido que el cliente ya no quiere. Anula el link (para que
        // no pague algo que ya no existe), libera el stock reservado y deja
        // escrito quién la canceló y por qué. Una venta cobrada no se cancela:
        // se reembolsa.
        group.MapPost("/orders/{id:guid}/cancel", async (
            Guid id, CancelOrderRequest? req, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            Inventory.Core.Domain.IStockRepository stock, IMercadoPagoPaymentService mp,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();
            var cancellable = order.EnsureCancellable();
            if (cancellable.IsFailure) return cancellable.Error.ToProblem();

            // El link primero: si se anulara después, entre cancelar y anular
            // el comprador todavía podría pagar una venta ya cancelada.
            var linkExpired = false;
            if (order.PreferenceId is { Length: > 0 } preference)
            {
                var expired = await mp.ExpirePreferenceAsync(tenant.TenantId, preference, ct);
                linkExpired = expired.IsSuccess;
                if (expired.IsFailure)
                    loggers.CreateLogger("Orders").LogWarning(
                        "No se pudo vencer la preference {Preference} de la venta {OrderId}: {Error}",
                        preference, order.Id, expired.Error.Code);
            }

            var by = http.User.Identity?.Name ?? http.User.GetUserId()?.ToString() ?? "admin";
            var cancelled = order.Cancel(by, req?.Reason);
            if (cancelled.IsFailure) return cancelled.Error.ToProblem();
            try
            {
                await orders.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Error.Conflict("Order.Concurrent",
                    "La venta cambió mientras se cancelaba (puede que se haya pagado). Recargá y revisala.").ToProblem();
            }

            // Una reserva que ya venció (o ya se liberó) no es un error: el
            // stock ya había vuelto solo.
            var released = 0;
            foreach (var reservationId in order.ReservationIds)
                if ((await stock.ReleaseReservationAsync(tenant.TenantId, reservationId, ct)).IsSuccess)
                    released++;

            return Results.Ok(new { order = ToDto(order), linkExpired, releasedReservations = released });
        }).RequireAnyPermission(Permission.OrdersCreate, Permission.OrdersRefund);

        // Marcar despachado (admin). Paid → Fulfilled + tracking + email/WhatsApp de envío.
        group.MapPost("/orders/{id:guid}/fulfill", async (
            Guid id, FulfillRequest req, ITenantContext tenant, Api.Orders.OrderFulfillment fulfillment, CancellationToken ct) =>
        {
            var result = await fulfillment.FulfillAsync(tenant.TenantId, id, req.Tracking, ct);
            if (result.IsFailure)
                return result.Error.Type == ErrorType.NotFound ? Results.NotFound() : result.Error.ToProblem();
            return Results.Ok(ToDto(result.Value));
        }).RequirePermission(Permission.OrdersFulfill);

        // Varias ventas marcadas como enviadas de una vez (desde el listado).
        // Cada una dispara lo mismo que desde su detalle —aviso al comprador,
        // factura al despachar— y el resultado dice qué pasó con cada una: el
        // panel tiene que poder contar "8 marcadas, 2 no (y por qué)", no un
        // "Error" genérico con la mitad ya hecha.
        group.MapPost("/orders/bulk/fulfill", async (
            BulkFulfillRequest req, ITenantContext tenant, IServiceScopeFactory scopes, CancellationToken ct) =>
        {
            var ids = (req.Ids ?? []).Distinct().ToList();
            if (ids.Count == 0)
                return Error.Validation("Order.BulkEmpty", "Elegí al menos una venta.").ToProblem();
            if (ids.Count > MaxBulkOrders)
                return Error.Validation("Order.BulkTooMany", $"Se pueden marcar hasta {MaxBulkOrders} ventas por vez.").ToProblem();

            var outcomes = await Api.Orders.OrderFulfillment.FulfillManyAsync(scopes, tenant.TenantId, ids, ct);
            return Results.Ok(new
            {
                fulfilled = outcomes.Count(o => o.Result == "fulfilled"),
                skipped = outcomes.Count(o => o.Result == "skipped"),
                failed = outcomes.Count(o => o.Result == "failed"),
                results = outcomes.Select(o => new { o.Id, o.Number, o.Result, o.Reason }),
            });
        }).RequirePermission(Permission.OrdersFulfill);

        // Reembolso total o parcial (admin). MP refund → estado + auditoría + email.
        // Lock por orden + recarga dentro del lock: dos requests concurrentes no
        // disparan dos refunds ni dos emails. La clave de idempotencia hacia MP es
        // el id del registro de auditoría: única por intento, así los parciales
        // sucesivos no se deduplican entre sí pero un retry de red sí.
        group.MapPost("/orders/{id:guid}/refund", async (
            Guid id, RefundRequest req, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            IMercadoPagoPaymentService mp, PaymentsDbContext paymentsDb, OrderNotifier notifier, WhatsAppNotifier whatsapp,
            global::Fiscal.Core.Abstractions.IFiscalEmissionQueue fiscalQueue,
            Inventory.Core.Domain.IStockRepository stock, Api.Orders.KitStockService kits,
            Api.Finance.LedgerPoster ledger, CancellationToken ct) =>
        {

            var gate = RefundLocks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
                if (order is null) return Results.NotFound();
                if (string.IsNullOrEmpty(order.PaymentId))
                    return Error.Validation("Order.NoPayment", "El pedido no tiene un pago para reembolsar.").ToProblem();
                if (order.Status is not (OrderStatus.Paid or OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded))
                    return Error.Conflict("Order.NotRefundable", "Solo se puede reembolsar un pedido pagado.").ToProblem();

                // Monto: null/0 = todo lo que queda; con valor = parcial validado server-side.
                var remaining = order.RemainingRefundable;
                var isTotal = req.Amount is null or <= 0m;
                var amount = isTotal ? remaining : Money.FromDecimal(req.Amount!.Value, order.Currency);
                if (amount.AmountInMinorUnits <= 0)
                    return Error.Validation("Refund.InvalidAmount", "No queda monto por reembolsar.").ToProblem();
                if (amount > remaining)
                    return OrderErrors.RefundExceedsRemaining(remaining).ToProblem();

                var requestedBy = http.User.Identity?.Name
                    ?? http.User.GetUserId()?.ToString() ?? "admin";
                var audit = PaymentRefund.Create(
                    Guid.NewGuid(), tenant.TenantId.Value, order.Id, order.PaymentId!,
                    amount.AmountInMinorUnits, order.Currency,
                    isTotal && order.RefundedAmount.IsZero, req.Reason, requestedBy);

                // Key de idempotencia DETERMINÍSTICA hacia MP: deriva del estado
                // acumulado + este monto. Un retry (crash antes de persistir) o un
                // doble-click con el mismo monto recomputan la MISMA key → MP
                // deduplica y NO reembolsa dos veces. Un parcial nuevo (RefundedAmount
                // ya avanzó) da otra key. Reemplaza el Guid aleatorio por intento.
                var idemKey = $"refund-{order.Id:N}-{order.RefundedAmount.AmountInMinorUnits}-{amount.AmountInMinorUnits}";

                // MP primero (la plata), estado local después. amount null a MP = total
                // del pago; con parciales previos siempre mandamos monto explícito.
                // Ventas manuales (efectivo/transferencia): la plata se devuelve a
                // mano — solo se registra el estado y la auditoría.
                var isManualPayment = order.PaymentId!.StartsWith(OrderPayment.ManualPrefix, StringComparison.Ordinal);
                if (!isManualPayment)
                {
                    var mpAmount = isTotal && order.RefundedAmount.IsZero ? (decimal?)null : amount.ToDecimal();
                    var refund = await mp.RefundAsync(tenant.TenantId, order.PaymentId!, mpAmount, idemKey, ct);
                    if (refund.IsFailure) return refund.Error.ToProblem();
                    audit.AttachMercadoPagoId(refund.Value.RefundId);
                }

                var applied = order.ApplyRefund(amount);
                if (applied.IsFailure) return applied.Error.ToProblem();

                try
                {
                    // xmin (token de concurrencia): si otra instancia ya aplicó un
                    // refund a esta orden, este SaveChanges falla → 409 en vez de
                    // doble aplicación local.
                    await orders.SaveChangesAsync(ct);
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Error.Conflict("Refund.Concurrent",
                        "El pedido cambió mientras se procesaba el reembolso. Recargá y verificá el estado.").ToProblem();
                }
                paymentsDb.PaymentRefunds.Add(audit);
                await paymentsDb.SaveChangesAsync(ct);

                // Venta a cuenta corriente: la plata nunca entró, así que no hay
                // nada que devolver — lo que baja es la deuda del cliente. Antes
                // el reembolso marcaba la venta y la deuda quedaba entera.
                if (OrderPayment.Of(order) == OrderPayment.CurrentAccount)
                    await ledger.PostSaleRefundAsync(
                        tenant.TenantId.Value, order.Id, audit.Id,
                        $"Reembolso venta {order.Label}",
                        amount.AmountInMinorUnits, order.Currency, DateTime.UtcNow, req.Reason, ct);

                if (order.Status == OrderStatus.Refunded)
                {
                    await notifier.NotifyAsync(order, "cancelacion-compra", ct);
                    await whatsapp.NotifyAsync(order, "cancelacion-compra", ct);
                    // Nota de crédito automática si la orden estaba facturada.
                    await fiscalQueue.EnqueueCreditNoteAsync(tenant.TenantId.Value, order.Id,
                        order.RefundedAmount.AmountInMinorUnits, order.DocNumber, ct);

                    // Devolución física: reingresar el stock (opt-in del operador,
                    // solo con reembolso TOTAL — un parcial no dice qué volvió).
                    // Sin esto, un reembolso dejaba el stock mintiendo.
                    if (req.Restock)
                    {
                        foreach (var item in order.Items)
                        {
                            try
                            {
                                await stock.AdjustAvailableAsync(
                                    tenant.TenantId, item.VariantId, item.Quantity,
                                    $"Devolución venta {order.Label}", ct);
                            }
                            catch
                            {
                                // best-effort: el reembolso ya está hecho; el ajuste
                                // manual de stock queda como recurso.
                            }
                        }
                        // Kits: la venta descontó los COMPONENTES, así que la
                        // devolución los devuelve (si no, quedaban descontados).
                        await kits.ReverseAsync(order, ct);
                    }
                }
                return Results.Ok(ToDto(order));
            }
            finally
            {
                gate.Release();
            }
        }).RequirePermission(Permission.OrdersRefund);

        // Historial de reembolsos de una orden (admin).
        group.MapGet("/orders/{id:guid}/refunds", async (
            Guid id, ITenantContext tenant, PaymentsDbContext paymentsDb, CancellationToken ct) =>
        {
            var items = await paymentsDb.PaymentRefunds.AsNoTracking()
                .Where(r => r.TenantId == tenant.TenantId.Value && r.OrderId == id)
                .OrderByDescending(r => r.CreatedAtUtc)
                .ToListAsync(ct);
            return Results.Ok(new
            {
                items = items.Select(r => new
                {
                    r.Id,
                    amount = ApiJson.MoneyJson(new Money(r.AmountInMinorUnits, r.Currency)),
                    r.IsTotal,
                    r.Reason,
                    r.RequestedBy,
                    mpRefundId = r.MercadoPagoRefundId,
                    r.CreatedAtUtc,
                }),
            });
        }).RequirePermission(Permission.OrdersRead);

        // --- Facturación de la orden (ARCA) ------------------------------------------
        // Estado fiscal de una orden: comprobantes emitidos + estado de los jobs de
        // emisión (para la pantalla de Ventas). Sin secretos.
        group.MapGet("/orders/{id:guid}/fiscal", async (
            Guid id, ITenantContext tenant, global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var docs = await fiscalDb.Documents.AsNoTracking()
                .Where(d => d.TenantId == tid && d.OrderId == id)
                .OrderBy(d => d.CreatedAtUtc).ToListAsync(ct);
            var jobs = await fiscalDb.EmissionJobs.AsNoTracking()
                .Where(j => j.TenantId == tid && j.OrderId == id)
                .ToListAsync(ct);
            return Results.Ok(new
            {
                documents = docs.Select(OrderComprobantePresenter.FiscalDocDto),
                jobs = jobs.Select(j => new
                {
                    j.Id,
                    kind = j.Kind.ToString(),
                    status = j.Status.ToString(),
                    j.Attempts,
                    j.LastError,
                    j.NextAttemptUtc,
                }),
            });
        }).RequirePermission(Permission.OrdersRead);

        // Facturar la orden manualmente ahora (síncrono, feedback inmediato). Gateado
        // con FiscalEmit. La guarda anti-duplicado vive en el emisor.
        //
        // El cuerpo es opcional. Sin él se factura con el documento que dejó el
        // comprador y la condición de IVA que se deduce de él, como siempre. Con
        // él, el comercio puede completar el documento que faltaba (una venta
        // grande sin DNI no se puede facturar anónima) y declarar la condición
        // que sabe o que le devolvió el padrón.
        group.MapPost("/orders/{id:guid}/invoice", async (
            Guid id, HttpRequest http, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter, CancellationToken ct) =>
        {
            // Se lee a mano y no como parámetro: con un parámetro de cuerpo, un
            // POST sin Content-Type —que antes andaba— pasaba a dar 415.
            InvoiceOrderRequest? request = null;
            if (http.HasJsonContentType() && http.ContentLength is not 0)
            {
                try { request = await http.ReadFromJsonAsync<InvoiceOrderRequest>(ct); }
                catch (System.Text.Json.JsonException)
                {
                    return Error.Validation("Order.BadInvoiceRequest", "El cuerpo no es un JSON válido.").ToProblem();
                }
            }

            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status is OrderStatus.PendingPayment or OrderStatus.Failed or OrderStatus.Cancelled)
                return Error.Conflict("Order.NotPayable", "Solo se puede facturar una orden pagada.").ToProblem();

            var buyerDoc = string.IsNullOrWhiteSpace(request?.BuyerDoc) ? order.DocNumber : request.BuyerDoc.Trim();
            var cmd = new global::Fiscal.Core.Abstractions.EmitInvoiceCommand(
                tenant.TenantId.Value, order.Id, order.Total.AmountInMinorUnits, buyerDoc,
                BuyerIvaCondition: Api.Fiscal.IvaConditionWire.Read(request?.BuyerIvaCondition));
            var result = await emitter.EmitAsync(cmd, ct);
            if (result.IsFailure) return result.Error.ToProblem();
            var r = result.Value;
            return Results.Ok(new
            {
                r.DocumentId,
                r.Authorized,
                r.PtoVta,
                cbteTipo = r.CbteTipo,
                r.Number,
                r.Cae,
                caeVto = r.CaeVto?.ToString("yyyy-MM-dd"),
                // Con Resultado "R" el motivo puede venir en Errors o en
                // Observaciones: se devuelven juntos y explicados, o el rechazo
                // llega al panel como "ver detalle" sin ningún detalle.
                errors = (r.Authorized ? r.Errors : r.Errors.Concat(r.Observations))
                    .Select(e => new { e.Code, Message = global::Fiscal.Core.Domain.ArcaErrorCatalog.Describe(e.Code, e.Message) }),
                observations = r.Authorized ? r.Observations.Select(e => new { e.Code, e.Message }) : [],
            });
        }).RequirePermission(Permission.FiscalEmit);

        // PDF del comprobante con QR de ARCA. type=invoice (default) | creditnote.
        // ---- Venta manual (WhatsApp / mostrador / teléfono) ----
        // La única puerta de entrada de una venta era el checkout: esto crea la
        // orden desde el admin — reserva stock de verdad, nace PAGADA (efectivo
        // o transferencia) y dispara los mismos side-effects que un pago de MP:
        // kits, email de confirmación y factura automática si está configurada.
        group.MapPost("/orders/manual", async (
            ManualOrderRequest request,
            ITenantContext tenant,
            Api.Orders.ManualOrderService manual,
            IConfiguration cfg,
            CancellationToken ct) =>
        {
            if (request.PaymentMethod is not ("cash" or "transfer" or "link"
                or Api.Orders.ManualOrderService.CurrentAccountMethod))
                return Error.Validation("Order.BadPayment", "Método de pago inválido.").ToProblem();
            // El link de pago se le manda al comprador: necesita email real.
            if (request.PaymentMethod == "link" && string.IsNullOrWhiteSpace(request.BuyerEmail))
                return Error.Validation("Order.LinkNeedsEmail",
                    "Para cobrar con link de Mercado Pago hace falta el email del comprador.").ToProblem();

            // La URL de retorno se valida ANTES de reservar stock: un rechazo
            // después de reservar dejaba las reservas colgadas media hora.
            string? linkBaseUrl = null;
            if (request.PaymentMethod == "link")
            {
                linkBaseUrl = SafeRedirect.SafeAbsoluteBase(request.ReturnUrl, cfg);
                if (linkBaseUrl is null)
                    return Error.Validation("Order.BadReturnUrl", "La URL de retorno no es válida.").ToProblem();
            }

            var result = await manual.CreateAsync(tenant.TenantId, request, linkBaseUrl, ct);
            if (result.IsFailure) return result.Error.ToProblem();

            var order = result.Value.Order;
            return Results.Created($"/api/v1/orders/{order.Id}", new
            {
                order.Id,
                order.Number,
                total = order.Total.AmountInMinorUnits,
                status = order.Status.ToString().ToUpperInvariant(),
                paymentLink = result.Value.PaymentLink,
            });
        }).RequirePermission(Permission.OrdersCreate);

        group.MapGet("/orders/{id:guid}/invoice.pdf", async (
            Guid id, string? type, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            global::Fiscal.Core.Abstractions.IComprobantePdfRenderer pdf, CancellationToken ct) =>
        {
            var wantNc = string.Equals(type, "creditnote", StringComparison.OrdinalIgnoreCase);
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            return await OrderInvoicePdf.DownloadAsync(fiscalDb, pdf, tenant.TenantId.Value, id, order, wantNc, ct);
        }).RequirePermission(Permission.OrdersRead);

        return group;
    }

    /// <summary>Crea la Order desde un checkout enviado, aplicando el cupón validado server-side.</summary>
    private static async Task<Result<Order>> BuildOrderAsync(
        TenantId tenantId, Guid sessionId, string? couponCode, string? utmSource,
        ICheckoutRepository checkouts, DiscountsDbContext discountsDb, CreateOrderHandler createOrder,
        Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, IShippingMethodRepository shippingMethods,
        CancellationToken ct)
    {
        var session = await checkouts.GetByIdAsync(tenantId, sessionId, ct);
        if (session is null) return Result.Failure<Order>(Error.NotFound("Checkout", sessionId));
        if (session.Status != CheckoutStatus.Submitted)
            return Result.Failure<Order>(Error.Conflict("Checkout.NotSubmitted",
                "El checkout debe estar enviado (con stock reservado) antes de pagar."));

        // Cupón: NUNCA confiar en el descuento del cliente; recalcular server-side.
        Money discount = Money.Zero(session.Currency);
        var freeShipping = false;
        var code = (couponCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length > 0)
        {
            var subtotal = session.Items.Aggregate(0L, (s, i) => s + i.UnitPrice.AmountInMinorUnits * i.Quantity);
            var coupon = await discountsDb.Coupons.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value && c.Code == code, ct);
            if (coupon is not null)
            {
                var ev = coupon.Evaluate(subtotal, DateTime.UtcNow);
                if (ev.Valid)
                {
                    if (ev.Discount > 0) discount = new Money(ev.Discount, session.Currency);
                    freeShipping = ev.FreeShipping;
                }
            }
        }

        // Un cupón de envío gratis no descuenta del producto: pone el envío en
        // cero. Sin esto, el carrito prometía "envío gratis" y el comprador
        // igual pagaba el envío completo.
        var shippingCost = freeShipping ? Money.Zero(session.Currency) : session.ShippingCost;

        // Snapshot de COSTO al momento de la venta (rentabilidad): se lee del
        // catálogo acá y no en el checkout — el costo que importa es el vigente
        // cuando la orden nace. Best effort: sin costo cargado, la orden va igual.
        var variantCosts = (await catalogQuery.GetVariantsAsync(
                tenantId.Value, session.Items.Select(i => i.VariantId).Distinct().ToList(), ct))
            .Where(v => v.Cost is not null)
            .ToDictionary(v => v.VariantId, v => new Money(v.Cost!.Amount, v.Cost.Currency));

        var lines = session.Items.Select(i => new CreateOrderLine(
            i.VariantId, i.ProductName, i.VariantDescription, i.Sku, i.UnitPrice, i.Quantity, i.ReservationId,
            variantCosts.TryGetValue(i.VariantId, out var cost) ? cost : null)).ToList();

        // Retiro en el local: lo dice el medio que eligió (los de carrier, aunque sean
        // "a sucursal", se despachan y siguen con su seguimiento).
        var isPickup = session.ShippingMethodId is { } methodId
            && (await shippingMethods.GetByIdAsync(tenantId, methodId, ct))?.Kind == ShippingKind.Pickup;

        var buyerFullName = string.Join(' ', new[] { session.BuyerName, session.BuyerLastName }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        return await createOrder.HandleAsync(new CreateOrderCommand(
            tenantId, session.Id, session.Email ?? string.Empty, session.Currency, lines,
            discount.IsZero ? null : discount, code.Length > 0 ? code : null,
            ShippingCost: shippingCost,
            ShippingMethodName: session.ShippingMethodName,
            ShippingAddress: session.ShippingAddress,
            BuyerName: buyerFullName.Length > 0 ? buyerFullName : null,
            BuyerPhone: session.Phone,
            DocNumber: session.DocNumber,
            Notes: session.Notes,
            UtmSource: utmSource,
            IsPickup: isPickup), ct);
    }

    private static PreferenceItem ToPreferenceItem(OrderItem i) => new(
        string.IsNullOrWhiteSpace(i.VariantDescription) ? i.ProductName : $"{i.ProductName} · {i.VariantDescription}",
        i.Quantity, i.UnitPrice.ToDecimal());

    private static object ToDto(Order order) => new
    {
        order.Id,
        order.Number,
        status = order.Status.ToString().ToUpperInvariant(),
        order.BuyerEmail,
        order.Currency,
        order.PaymentProvider,
        order.PreferenceId,
        order.PaymentId,
        order.CouponCode,
        order.CreatedAtUtc,
        order.PaidAtUtc,
        order.Tracking,
        order.FulfilledAtUtc,
        channel = order.Channel,
        paymentMethod = OrderPayment.Of(order),
        shippingStatus = OrderShipping.Of(order),
        order.CancelledAtUtc,
        order.CancelledBy,
        order.CancelReason,
        subtotal = ApiJson.MoneyJson(order.Subtotal),
        discount = ApiJson.MoneyJson(order.DiscountAmount),
        shipping = ApiJson.MoneyJson(order.ShippingCost),
        shippingMethod = order.ShippingMethodName,
        isPickup = order.IsPickup,
        shippingAddress = order.ShippingAddress,
        buyerName = order.BuyerName,
        buyerPhone = order.BuyerPhone,
        docNumber = order.DocNumber,
        notes = order.Notes,
        total = ApiJson.MoneyJson(order.Total),
        refunded = ApiJson.MoneyJson(order.RefundedAmount),
        refundable = ApiJson.MoneyJson(order.RemainingRefundable),
        items = order.Items.Select(i => new
        {
            i.VariantId,
            i.ProductName,
            i.VariantDescription,
            i.Sku,
            i.Quantity,
            unitPrice = ApiJson.MoneyJson(i.UnitPrice),
        }),
    };
}

public sealed record FulfillRequest(string? Tracking);

public sealed record CancelOrderRequest(string? Reason);

/// <summary>
/// Los filtros del listado de Ventas tal como viajan en la URL del panel. Las
/// fechas son días de Argentina: "hasta el 14" incluye todo el 14 hasta la
/// medianoche de acá, no hasta las 21 h.
/// </summary>
public sealed record OrderListQuery(
    string? Q,
    string? Status,
    DateOnly? From,
    DateOnly? To,
    string? Channel,
    string? Shipping,
    string? Payment,
    string? Ids)
{
    // Argentina no tiene horario de verano desde 2009: UTC−3 fijo.
    private static readonly TimeSpan Argentina = TimeSpan.FromHours(-3);

    public OrderListFilter ToFilter() => new(
        Q,
        Status,
        From is { } from ? StartOfDayUtc(from) : null,
        To is { } to ? StartOfDayUtc(to.AddDays(1)) : null,
        Channel,
        Shipping,
        Payment,
        ParseIds(Ids));

    private static DateTime StartOfDayUtc(DateOnly day) =>
        DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue) - Argentina, DateTimeKind.Utc);

    /// <summary>"a,b,c" → ids; lo que no es un id se ignora, y hay tope (es una selección de la tabla).</summary>
    private static List<Guid>? ParseIds(string? ids)
    {
        if (string.IsNullOrWhiteSpace(ids)) return null;
        var parsed = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
            .Where(g => g != Guid.Empty)
            .Distinct()
            .Take(500)
            .ToList();
        // Pidió ids y ninguno era válido: no tiene que bajar todas las ventas.
        return parsed.Count > 0 ? parsed : [Guid.Empty];
    }
}

public sealed record BulkFulfillRequest(IReadOnlyList<Guid>? Ids);

public sealed record RefundRequest(decimal? Amount, string? Reason, bool Restock = false);

public sealed record PayCheckoutRequest(string? ReturnUrl, string? CouponCode, string? UtmSource = null);

/// <summary>
/// Cobro con Payway. El navegador ya cambió la tarjeta por un token contra
/// Payway, así que acá nunca llegan ni el número ni el código de seguridad.
/// </summary>
public sealed record PayPaywayRequest(
    string Token,
    string Bin,
    int? Installments,
    string? CardLastFour,
    string? CardBrand,
    bool IsDebit,
    string? CouponCode,
    string? UtmSource = null);

public sealed record PayOnsiteRequest(
    string Token,
    string PaymentMethodId,
    int? Installments,
    string? IssuerId,
    string? PayerDocType,
    string? PayerDocNumber,
    string? CouponCode,
    string? UtmSource = null);

public sealed record ManualOrderItemRequest(Guid VariantId, int Quantity, long? UnitPriceMinor = null);
public sealed record ManualOrderRequest(
    IReadOnlyList<ManualOrderItemRequest>? Items,
    string PaymentMethod,
    string? ReturnUrl = null,
    string? BuyerEmail = null,
    string? BuyerName = null,
    string? BuyerPhone = null,
    string? DocNumber = null,
    string? Notes = null,
    long? DiscountMinor = null,
    long? ShippingCostMinor = null,
    string? ShippingMethodName = null,
    string? ShippingAddress = null,
    // Cliente de la ficha, cuando la venta va a su cuenta corriente.
    Guid? CustomerId = null);

/// <summary>Datos del comprador para facturar una venta; todo opcional.</summary>
public sealed record InvoiceOrderRequest(string? BuyerDoc, string? BuyerIvaCondition);
