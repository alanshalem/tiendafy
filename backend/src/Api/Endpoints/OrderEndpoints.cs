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

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, checkouts, discountsDb, createOrder, catalogQuery, ct);
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
            SettlePaymentHandler settle,
            IMercadoPagoPaymentService mp,
            Api.Orders.PaidOrderSideEffects paidEffects,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.PaymentMethodId))
                return Error.Validation("Payment.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, request.UtmSource, checkouts, discountsDb, createOrder, catalogQuery, ct);
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
            Customers.Infrastructure.CustomersDbContext customersDb, IMembershipService memberships, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();

            // ¿Shopper dueño de la orden?
            var customer = await Api.Shop.ShopAuth.ResolveAsync(http, customersDb, ct);
            var isOwnerShopper = customer is not null && !string.IsNullOrEmpty(customer.Email)
                && string.Equals(order.BuyerEmail, customer.Email, StringComparison.OrdinalIgnoreCase);

            // ¿Staff con permiso de lectura de órdenes?
            var userId = http.User.GetUserId();
            var isStaff = userId is not null
                && await memberships.RoleAsync(userId.Value, tenant.TenantId.Value, ct) is { } role
                && RolePermissions.Has(role, Permission.OrdersRead);

            if (!isOwnerShopper && !isStaff)
                return Results.NotFound(); // no revelar existencia a terceros

            return Results.Ok(ToDto(order));
        }).RequireTenant();

        group.MapGet("/orders", async (
            ITenantContext tenant, IOrderRepository orders, Guid? after, int? limit, CancellationToken ct) =>
        {
            var items = await orders.ListAsync(tenant.TenantId, Math.Clamp(limit ?? 20, 1, 100), after, ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        }).RequirePermission(Permission.OrdersRead);

        // Marcar despachado (admin). Paid → Fulfilled + tracking + email/WhatsApp de envío.
        group.MapPost("/orders/{id:guid}/fulfill", async (
            Guid id, FulfillRequest req, ITenantContext tenant, IOrderRepository orders, OrderNotifier notifier, WhatsAppNotifier whatsapp,
            global::Fiscal.Core.Abstractions.IFiscalEmissionQueue fiscalQueue, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();
            var r = order.MarkFulfilled(req.Tracking);
            if (r.IsFailure) return r.Error.ToProblem();
            await orders.SaveChangesAsync(ct);
            await notifier.NotifyAsync(order, "confirmacion-envio", ct);
            await whatsapp.NotifyAsync(order, "confirmacion-envio", ct);
            // Factura automática si el trigger configurado es "al despachar".
            await fiscalQueue.EnqueueInvoiceAsync(tenant.TenantId.Value, order.Id, order.Total.AmountInMinorUnits,
                order.DocNumber, global::Fiscal.Core.Domain.EmissionTrigger.OnFulfillment, ct);
            return Results.Ok(ToDto(order));
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
            CancellationToken ct) =>
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
                var isManualPayment = order.PaymentId!.StartsWith("manual-", StringComparison.Ordinal);
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
                                    $"Devolución venta {order.Id.ToString()[..8]}", ct);
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
        group.MapPost("/orders/{id:guid}/invoice", async (
            Guid id, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status is OrderStatus.PendingPayment or OrderStatus.Failed or OrderStatus.Cancelled)
                return Error.Conflict("Order.NotPayable", "Solo se puede facturar una orden pagada.").ToProblem();

            var cmd = new global::Fiscal.Core.Abstractions.EmitInvoiceCommand(
                tenant.TenantId.Value, order.Id, order.Total.AmountInMinorUnits, order.DocNumber);
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
                errors = r.Errors.Select(e => new { e.Code, e.Message }),
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
            if (request.PaymentMethod is not ("cash" or "transfer" or "link"))
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
                total = order.Total.AmountInMinorUnits,
                status = order.Status.ToString().ToUpperInvariant(),
                paymentLink = result.Value.PaymentLink,
            });
        }).RequirePermission(Permission.OrdersFulfill);

        group.MapGet("/orders/{id:guid}/invoice.pdf", async (
            Guid id, string? type, ITenantContext tenant, IOrderRepository orders,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            global::Fiscal.Core.Abstractions.IComprobantePdfRenderer pdf, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var wantNc = string.Equals(type, "creditnote", StringComparison.OrdinalIgnoreCase);

            var docs = await fiscalDb.Documents.AsNoTracking()
                .Where(d => d.TenantId == tid && d.OrderId == id
                    && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized)
                .OrderByDescending(d => d.CreatedAtUtc).ToListAsync(ct);
            var doc = docs.FirstOrDefault(d => OrderComprobantePresenter.IsNc(d.CbteTipo) == wantNc);
            if (doc is null) return Results.NotFound();

            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            var cfg = await fiscalDb.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tid, ct);
            if (cfg is null) return Results.NotFound();

            var data = OrderComprobantePresenter.BuildPdfData(doc, order, cfg);
            var bytes = pdf.Render(data);
            return Results.File(bytes, "application/pdf", $"comprobante-{doc.PtoVta:0000}-{doc.Number:00000000}.pdf");
        }).RequirePermission(Permission.OrdersRead);

        return group;
    }

    /// <summary>Crea la Order desde un checkout enviado, aplicando el cupón validado server-side.</summary>
    private static async Task<Result<Order>> BuildOrderAsync(
        TenantId tenantId, Guid sessionId, string? couponCode, string? utmSource,
        ICheckoutRepository checkouts, DiscountsDbContext discountsDb, CreateOrderHandler createOrder,
        Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, CancellationToken ct)
    {
        var session = await checkouts.GetByIdAsync(tenantId, sessionId, ct);
        if (session is null) return Result.Failure<Order>(Error.NotFound("Checkout", sessionId));
        if (session.Status != CheckoutStatus.Submitted)
            return Result.Failure<Order>(Error.Conflict("Checkout.NotSubmitted",
                "El checkout debe estar enviado (con stock reservado) antes de pagar."));

        // Cupón: NUNCA confiar en el descuento del cliente; recalcular server-side.
        Money discount = Money.Zero(session.Currency);
        var code = (couponCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length > 0)
        {
            var subtotal = session.Items.Aggregate(0L, (s, i) => s + i.UnitPrice.AmountInMinorUnits * i.Quantity);
            var coupon = await discountsDb.Coupons.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value && c.Code == code, ct);
            if (coupon is not null)
            {
                var ev = coupon.Evaluate(subtotal, DateTime.UtcNow);
                if (ev.Valid && ev.Discount > 0) discount = new Money(ev.Discount, session.Currency);
            }
        }

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

        var buyerFullName = string.Join(' ', new[] { session.BuyerName, session.BuyerLastName }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        return await createOrder.HandleAsync(new CreateOrderCommand(
            tenantId, session.Id, session.Email ?? string.Empty, session.Currency, lines,
            discount.IsZero ? null : discount, code.Length > 0 ? code : null,
            ShippingCost: session.ShippingCost,
            ShippingMethodName: session.ShippingMethodName,
            ShippingAddress: session.ShippingAddress,
            BuyerName: buyerFullName.Length > 0 ? buyerFullName : null,
            BuyerPhone: session.Phone,
            DocNumber: session.DocNumber,
            Notes: session.Notes,
            UtmSource: utmSource), ct);
    }

    private static PreferenceItem ToPreferenceItem(OrderItem i) => new(
        string.IsNullOrWhiteSpace(i.VariantDescription) ? i.ProductName : $"{i.ProductName} · {i.VariantDescription}",
        i.Quantity, i.UnitPrice.ToDecimal());

    private static object ToDto(Order order) => new
    {
        order.Id,
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
        subtotal = ApiJson.MoneyJson(order.Subtotal),
        discount = ApiJson.MoneyJson(order.DiscountAmount),
        shipping = ApiJson.MoneyJson(order.ShippingCost),
        shippingMethod = order.ShippingMethodName,
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

public sealed record RefundRequest(decimal? Amount, string? Reason, bool Restock = false);

public sealed record PayCheckoutRequest(string? ReturnUrl, string? CouponCode, string? UtmSource = null);

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
    string? ShippingAddress = null);
