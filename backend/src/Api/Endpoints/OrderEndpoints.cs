using Api.Auth;
using Api.Fiscal;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using Orders.Infrastructure.Persistence;
using Payments.Contracts;
using Payments.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class OrderEndpoints
{
    /// <summary>Tope de ventas por despacho en lote: una página del listado entra holgada.</summary>
    private const int MaxBulkOrders = 100;

    public static RouteGroupBuilder MapOrderEndpoints(this RouteGroupBuilder group)
    {
        // Pagar con Checkout Pro (redirect) → crea Order + preference MP.
        group.MapPost("/checkout/{id:guid}/pay", async (
            Guid id,
            PayCheckoutRequest request,
            ITenantContext tenant,
            Api.Orders.CheckoutOrderFactory orderFactory,
            IOrderRepository orders,
            IMercadoPagoPaymentService mp,
            IConfiguration cfg,
            ILoggerFactory loggers,
            CancellationToken ct) =>
        {
            var logger = loggers.CreateLogger("Api.Checkout.Pay");

            // El returnUrl (back_urls de MP) viene del cliente: validar que sea
            // un dominio propio o MP redirige al comprador post-pago a un sitio
            // de phishing. Sin URL segura, no se puede iniciar el pago.
            var baseUrl = SafeRedirect.SafeAbsoluteBase(request.ReturnUrl, cfg);
            if (baseUrl is null)
                return Error.Validation("Checkout.BadReturnUrl",
                    "La URL de retorno no es válida.").ToProblem();

            // Un segundo pedido sobre la misma compra (doble clic, reintento,
            // otra pestaña) reusa la orden pendiente: la preference sale con la
            // misma clave de idempotencia (el id de la orden), así que Mercado
            // Pago devuelve la que ya había en vez de abrir otro link.
            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value.Order;

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

            // La primera preference es la que queda anotada (la que se vence
            // al cancelar la venta); si dos pedidos llegan juntos, el segundo
            // guardado choca con el primero (xmin) y se queda con la de él.
            if (order.PreferenceId is null)
            {
                order.AttachPreference(prefResult.Value.PreferenceId);
                try
                {
                    await orders.SaveChangesAsync(ct);
                }
                catch (DbUpdateConcurrencyException)
                {
                    logger.LogInformation(
                        "La orden {OrderId} ya tenía preference de otro pedido simultáneo; se devuelve el link igual.", order.Id);
                }
            }
            return Results.Ok(new { orderId = order.Id, initPoint = prefResult.Value.InitPoint });
        }).RequireTenant().RequireRateLimiting("payments");

        // Pagar on-site (Checkout API/Bricks): el front tokeniza la tarjeta.
        group.MapPost("/checkout/{id:guid}/pay-onsite", async (
            Guid id,
            PayOnsiteRequest request,
            ITenantContext tenant,
            Api.Orders.CheckoutOrderFactory orderFactory,
            SettlePaymentHandler settle,
            IMercadoPagoPaymentService mp,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.PaymentMethodId))
                return Error.Validation("Payment.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            // Con la orden reusada (doble clic, reintento, otra pestaña) el cobro
            // sale con la misma clave de idempotencia, el id de la orden: si ya
            // había uno —aprobado, en proceso o esperando el 3DS—, Mercado Pago
            // devuelve ese en vez de cobrar otra vez, y acá se contesta lo mismo.
            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value.Order;

            var payResult = await mp.CreateCardPaymentAsync(new CreateCardPaymentRequest(
                tenant.TenantId, order.Id, order.Total.ToDecimal(),
                request.Token, request.PaymentMethodId, request.Installments ?? 1, request.IssuerId,
                order.BuyerEmail, request.PayerDocType, request.PayerDocNumber), ct);
            if (payResult.IsFailure) return payResult.Error.ToProblem();
            var card = payResult.Value;

            // Aplicar el resultado ya (el webhook es backup, idempotente).
            await SettleNowAsync(settle, paidEffects, order.Id, card.Status, card.PaymentId, ct);

            // Si el banco pide confirmar el pago (3DS), la orden queda pendiente
            // y la tienda muestra el desafío con estos datos; el resultado final
            // llega por webhook. El id de pago lo necesita el Status Screen Brick
            // para mostrar el desafío; la URL y el creq son los que manda Mercado
            // Pago para eso (no hay tokens ni datos de la tarjeta).
            return Results.Ok(new
            {
                orderId = order.Id,
                status = card.Status,
                statusDetail = card.StatusDetail,
                challenge = card.Challenge is { } c
                    ? new { paymentId = card.PaymentId, externalResourceUrl = c.ExternalResourceUrl, creq = c.Creq }
                    : null,
            });
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
            Api.Orders.CheckoutOrderFactory orderFactory,
            SettlePaymentHandler settle,
            IPaywayPaymentService payway,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Bin))
                return Error.Validation("Payway.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            // Solo las cuotas que la tienda configuró con Payway: otro número no
            // es un plan que el comercio haya acordado (y Payway podría cobrarlo
            // igual). Se chequea antes de crear la orden, que no quede una huérfana.
            var installments = request.Installments ?? 1;
            var paywayConfig = await payway.GetPublicConfigAsync(tenant.TenantId, ct);
            if (paywayConfig.Enabled && !paywayConfig.InstallmentOptions.Contains(installments))
                return Error.Validation("Payway.BadInstallments",
                    installments == 1
                        ? "La tienda no ofrece pagar en un pago. Elegí una de las opciones de cuotas."
                        : $"La tienda no ofrece pagar en {installments} cuotas. Elegí una de las opciones de cuotas.").ToProblem();

            // Con la orden reusada, Payway no se vuelve a cobrar si ya hay un
            // intento aprobado o sin resolver: ChargeAsync devuelve ese (no hay
            // idempotencia del lado de Payway; la lleva PaywayClient).
            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value.Order;

            // El total sale del snapshot de la orden, nunca de lo que mande el
            // navegador, y ya está en centavos: la unidad que espera Payway.
            var payResult = await payway.ChargeAsync(new PaywayChargeRequest(
                tenant.TenantId, order.Id,
                order.Total.AmountInMinorUnits, order.Currency,
                request.Token, request.Bin.Trim(),
                installments,
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
                await SettleNowAsync(settle, paidEffects, order.Id, "approved", paymentId, ct);

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
            int? offset, [AsParameters] OrderListQuery query,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb, OrdersDbContext ordersDb, CancellationToken ct) =>
        {
            var take = Math.Clamp(limit ?? 20, 1, 100);
            if (after is null)
            {
                var filter = await query.ToFilterAsync(tenant.TenantId.Value, fiscalDb, ordersDb, ct);
                var (page, total) = await orders.ListPageAsync(
                    tenant.TenantId, take, Math.Max(0, offset ?? 0), filter, ct);
                return Results.Ok(new { items = page.Select(ToDto), total });
            }

            var items = await orders.ListAsync(tenant.TenantId, take, after, ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        }).RequirePermission(Permission.OrdersRead);

        // El listado entero (con la misma búsqueda y los mismos filtros que la
        // pantalla) como planilla. Se escribe a medida que sale de la base: no
        // tiene el tope de 100 del listado ni junta miles de ventas en memoria.
        // Con ids= baja solo esas (las elegidas en la tabla).
        group.MapGet("/orders/export", async (
            ITenantContext tenant, IOrderRepository orders, [AsParameters] OrderListQuery query,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb, OrdersDbContext ordersDb, CancellationToken ct) =>
        {
            var filter = await query.ToFilterAsync(tenant.TenantId.Value, fiscalDb, ordersDb, ct);
            return Api.Fiscal.VatBookCsv.Download(
                $"ventas-{ArgentinaTime.Today:yyyy-MM-dd}.csv",
                Api.Orders.OrderCsv.Header,
                orders.StreamAsync(tenant.TenantId, filter).Select(Api.Orders.OrderCsv.Row),
                ct);
        }).RequirePermission(Permission.OrdersRead);

        // Cancelar una venta que nunca se cobró: el link de pago que no se
        // pagó, el pedido que el cliente ya no quiere. Anula el link (para que
        // no pague algo que ya no existe), libera el stock reservado y deja
        // escrito quién la canceló y por qué. Una venta cobrada no se cancela:
        // se reembolsa.
        group.MapPost("/orders/{id:guid}/cancel", async (
            Guid id, CancelOrderRequest? req, HttpContext http, ITenantContext tenant,
            Api.Orders.OrderRefundService refunds, CancellationToken ct) =>
        {
            var result = await refunds.CancelAsync(tenant.TenantId, id, req?.Reason, ActorOf(http), ct);
            if (result.IsFailure)
                return result.Error.Type == ErrorType.NotFound ? Results.NotFound() : result.Error.ToProblem();
            var c = result.Value;
            return Results.Ok(new { order = ToDto(c.Order), linkExpired = c.LinkExpired, releasedReservations = c.ReleasedReservations });
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

        // Reembolso total o parcial (admin). MP refund → estado + auditoría +
        // avisos (ver OrderRefundService).
        group.MapPost("/orders/{id:guid}/refund", async (
            Guid id, RefundRequest req, HttpContext http, ITenantContext tenant,
            Api.Orders.OrderRefundService refunds, CancellationToken ct) =>
        {
            // La NC a pedido es facturar: sin ese permiso, la casilla no cuenta.
            if (req.CreditNote == true && (await http.GetAccessAsync())?.Can(Permission.FiscalEmit) != true)
                req = req with { CreditNote = false };
            var result = await refunds.RefundAsync(tenant.TenantId, id, req, ActorOf(http), ct);
            if (result.IsFailure)
                return result.Error.Type == ErrorType.NotFound ? Results.NotFound() : result.Error.ToProblem();
            return Results.Ok(ToDto(result.Value));
        }).RequirePermission(Permission.OrdersRefund);

        // Historial de reembolsos de una orden (admin), y por dónde vuelve la
        // plata si se reembolsa (Mercado Pago, Payway o a mano): la orden no
        // lo guarda y el diálogo de reembolso tiene que nombrar el medio real.
        group.MapGet("/orders/{id:guid}/refunds", async (
            Guid id, ITenantContext tenant, PaymentsDbContext paymentsDb, IOrderRepository orders,
            Api.Orders.OrderRefundService refunds, CancellationToken ct) =>
        {
            var items = await paymentsDb.PaymentRefunds.AsNoTracking()
                .Where(r => r.TenantId == tenant.TenantId.Value && r.OrderId == id)
                .OrderByDescending(r => r.CreatedAtUtc)
                .ToListAsync(ct);
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            var gateway = order is null ? null : await refunds.GatewayOfAsync(tenant.TenantId, order, ct);
            return Results.Ok(new
            {
                gateway = gateway switch
                {
                    Api.Orders.OrderRefundService.RefundGateway.MercadoPago => "mercadopago",
                    Api.Orders.OrderRefundService.RefundGateway.Payway => "payway",
                    Api.Orders.OrderRefundService.RefundGateway.Manual => "manual",
                    _ => null,
                },
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
            Guid id, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            var cfg = await fiscalDb.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tid, ct);
            var credit = order is null ? null : await Api.Fiscal.OrderCreditNotes.ForOrderAsync(fiscalDb, order, ct);
            var docs = await fiscalDb.Documents.AsNoTracking()
                .Where(d => d.TenantId == tid && d.OrderId == id)
                .OrderBy(d => d.CreatedAtUtc).ToListAsync(ct);
            var jobs = await fiscalDb.EmissionJobs.AsNoTracking()
                .Where(j => j.TenantId == tid && j.OrderId == id)
                .ToListAsync(ct);
            return Results.Ok(new
            {
                // El ambiente en que factura hoy la tienda (null sin configurar):
                // una factura de homologación no cuenta en producción.
                environment = cfg?.Environment.ToString().ToUpperInvariant(),
                // La tienda emite sola (la NC de un reembolso sale sin pedirla).
                autoInvoice = cfg is { Enabled: true, AutoInvoiceEnabled: true },
                documents = docs.Select(OrderComprobantePresenter.FiscalDocDto),
                jobs = jobs.Select(j => new
                {
                    j.Id,
                    kind = j.Kind.ToString(),
                    status = j.Status.ToString(),
                    j.Attempts,
                    j.LastError,
                    j.NextAttemptUtc,
                    amount = j.GrossMinorUnits,
                    j.Reason,
                }),
                // Lo acreditado de la factura frente a lo devuelto (centavos), o
                // null si la venta no tiene factura en el ambiente actual.
                credit,
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
            global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter, Api.Fiscal.InvoiceEmail invoiceEmail, CancellationToken ct) =>
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
            // La factura al comprador por email, si la tienda prendió la plantilla.
            if (r.Authorized) await invoiceEmail.SendAsync(tenant.TenantId.Value, r.DocumentId, ct);
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
            if (request.PaymentMethod is not (OrderPayment.Cash or OrderPayment.Transfer or "link"
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

        // Con document= baja ese comprobante (una venta puede tener varias NC).
        group.MapGet("/orders/{id:guid}/invoice.pdf", async (
            Guid id, string? type, Guid? document, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            global::Fiscal.Core.Abstractions.IComprobantePdfRenderer pdf, CancellationToken ct) =>
        {
            var wantNc = string.Equals(type, "creditnote", StringComparison.OrdinalIgnoreCase);
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            return await OrderInvoicePdf.DownloadAsync(fiscalDb, pdf, tenant.TenantId.Value, id, order, wantNc, ct, document);
        }).RequirePermission(Permission.OrdersRead);

        // Nota de crédito a mano: por lo devuelto sin acreditar o por un ajuste
        // (un precio corregido, un descuento posterior). Con el permiso de
        // facturar. La clave de idempotencia la manda el panel (una por
        // diálogo): el doble click o el reintento no emiten dos.
        group.MapPost("/orders/{id:guid}/credit-notes", async (
            Guid id, ManualCreditNoteRequest req, ITenantContext tenant, IOrderRepository orders,
            Api.Fiscal.CreditNoteIssuer creditNotes, CancellationToken ct) =>
        {
            if (!global::Fiscal.Core.Domain.CreditNoteKeys.IsValidClientKey(req.IdempotencyKey))
                return Error.Validation("CreditNote.BadKey", "Falta la clave del pedido (idempotencyKey).").ToProblem();
            if (req.Amount is not > 0m)
                return Error.Validation(global::Fiscal.Core.Domain.CreditNoteErrors.InvalidAmount,
                    "El monto de la nota de crédito tiene que ser mayor a cero.").ToProblem();
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();

            var minor = (long)Math.Round(req.Amount.Value * 100m, MidpointRounding.AwayFromZero);
            var result = await creditNotes.IssueManualAsync(order, minor, req.IdempotencyKey!, req.Reason, ct);
            if (result.IsFailure) return result.Error.ToProblem();
            var r = result.Value;
            return Results.Ok(new
            {
                r.Queued,
                r.Authorized,
                r.DocumentId,
                cbteTipo = r.CbteTipo,
                r.PtoVta,
                r.Number,
                r.Cae,
                errors = r.Errors.Select(e => new { e.Code, e.Message }),
            });
        }).RequirePermission(Permission.FiscalEmit);

        return group;
    }

    /// <summary>
    /// Aplica a la orden el resultado de un cobro hecho en el mismo pedido. Si
    /// otro pedido sobre la misma compra (doble clic, otra pestaña) lo aplicó
    /// en el mismo instante, este guardado choca con el suyo (xmin) y no queda
    /// nada por hacer: la venta ya está pagada y sus efectos corren en el otro.
    /// </summary>
    private static async Task SettleNowAsync(
        SettlePaymentHandler settle, Api.Orders.PaidOrderSideEffects paidEffects,
        Guid orderId, string status, string paymentId, CancellationToken ct)
    {
        Result<SettleResult> settled;
        try
        {
            settled = await settle.HandleAsync(orderId, status, paymentId, ct: ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return;
        }
        await paidEffects.RunIfJustPaidAsync(settled, ct);
    }

    /// <summary>Quién hizo la acción, para dejarlo escrito: su nombre, si no su id, y si no "admin".</summary>
    private static string ActorOf(HttpContext http) =>
        http.User.Identity?.Name ?? http.User.GetUserId()?.ToString() ?? "admin";

    private static PreferenceItem ToPreferenceItem(OrderItem i) => new(
        string.IsNullOrWhiteSpace(i.VariantDescription) ? i.ProductName : $"{i.ProductName} · {i.VariantDescription}",
        i.Quantity, i.UnitPrice.ToDecimal());

    internal static object ToDto(Order order) => new
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
        // La parte del descuento que vino de pagar por transferencia o en
        // efectivo (ya incluida en discount), y hasta cuándo se espera el pago.
        paymentMethodDiscount = ApiJson.MoneyJson(order.PaymentMethodDiscount),
        order.PaymentDueAtUtc,
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

/// <summary>Una nota de crédito a mano: monto en pesos, motivo opcional y la clave del pedido.</summary>
public sealed record ManualCreditNoteRequest(decimal? Amount, string? Reason, string? IdempotencyKey);

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
    string? Ids,
    string? Fiscal = null)
{
    /// <summary>
    /// Los filtros, más el fiscal (<c>fiscal=devueltas-sin-nc</c>: facturadas con
    /// plata devuelta sin nota de crédito), que se resuelve contra el módulo
    /// fiscal y viaja como lista de ventas.
    /// </summary>
    public async Task<OrderListFilter> ToFilterAsync(
        Guid tenantId, global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb, OrdersDbContext ordersDb,
        CancellationToken ct)
    {
        var filter = ToFilter();
        if (!string.Equals(Fiscal, Api.Fiscal.OrderCreditNotes.RefundedUncreditedFilter, StringComparison.OrdinalIgnoreCase))
            return filter;

        var ids = await Api.Fiscal.OrderCreditNotes.RefundedUncreditedIdsAsync(fiscalDb, ordersDb, tenantId, ct);
        if (filter.Ids is { } chosen) ids = ids.Intersect(chosen).ToList();
        // Ninguna: no tiene que traer todas las ventas.
        return filter with { Ids = ids.Count > 0 ? ids : [Guid.Empty] };
    }

    public OrderListFilter ToFilter() => new(
        Q,
        Status,
        From is { } from ? ArgentinaTime.StartOfDayUtc(from) : null,
        To is { } to ? ArgentinaTime.StartOfDayUtc(to.AddDays(1)) : null,
        Channel,
        Shipping,
        Payment,
        ParseIds(Ids));

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

/// <param name="CreditNote">
/// Emitir la nota de crédito por este monto aunque la tienda no emita
/// automáticamente (la casilla del diálogo). Con emisión automática sale sola
/// igual. Hace falta además el permiso de facturar.
/// </param>
public sealed record RefundRequest(decimal? Amount, string? Reason, bool Restock = false, bool? CreditNote = null);

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
