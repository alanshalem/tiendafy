using Api.Auth;
using Api.Fiscal;
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
            CancellationToken ct) =>
        {

            // El returnUrl (back_urls de MP) viene del cliente: validar que sea
            // un dominio propio o MP redirige al comprador post-pago a un sitio
            // de phishing. Sin URL segura, no se puede iniciar el pago.
            var baseUrl = SafeRedirect.SafeAbsoluteBase(request.ReturnUrl, cfg);
            if (baseUrl is null)
                return Error.Validation("Checkout.BadReturnUrl",
                    "La URL de retorno no es válida.").ToProblem();

            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
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
            Api.Orders.CheckoutOrderFactory orderFactory,
            SettlePaymentHandler settle,
            IMercadoPagoPaymentService mp,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.PaymentMethodId))
                return Error.Validation("Payment.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
            if (orderResult.IsFailure) return orderResult.Error.ToProblem();
            var order = orderResult.Value;

            var payResult = await mp.CreateCardPaymentAsync(new CreateCardPaymentRequest(
                tenant.TenantId, order.Id, order.Total.ToDecimal(),
                request.Token, request.PaymentMethodId, request.Installments ?? 1, request.IssuerId,
                order.BuyerEmail, request.PayerDocType, request.PayerDocNumber), ct);
            if (payResult.IsFailure) return payResult.Error.ToProblem();
            var card = payResult.Value;

            // Aplicar el resultado ya (el webhook es backup, idempotente).
            await paidEffects.RunIfJustPaidAsync(
                await settle.HandleAsync(order.Id, card.Status, card.PaymentId, ct: ct), ct);

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
            Api.Orders.CheckoutOrderFactory orderFactory,
            SettlePaymentHandler settle,
            IPaywayPaymentService payway,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Bin))
                return Error.Validation("Payway.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await orderFactory.CreateAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, ct);
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
                await paidEffects.RunIfJustPaidAsync(
                    await settle.HandleAsync(order.Id, "approved", paymentId, ct: ct), ct);

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
            var result = await refunds.RefundAsync(tenant.TenantId, id, req, ActorOf(http), ct);
            if (result.IsFailure)
                return result.Error.Type == ErrorType.NotFound ? Results.NotFound() : result.Error.ToProblem();
            return Results.Ok(ToDto(result.Value));
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
