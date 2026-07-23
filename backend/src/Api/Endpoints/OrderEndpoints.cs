using Identity.Infrastructure;
using System.Collections.Concurrent;
using Api.Auth;
using Api.Notifications;
using Checkout.Core.Domain;
using Discounts.Infrastructure;
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
            IOrderRepository orders,
            IMercadoPagoPaymentService mp,
            IConfiguration cfg,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();

            // El returnUrl (back_urls de MP) viene del cliente: validar que sea
            // un dominio propio o MP redirige al comprador post-pago a un sitio
            // de phishing. Sin URL segura, no se puede iniciar el pago.
            var baseUrl = SafeRedirect.SafeAbsoluteBase(request.ReturnUrl, cfg);
            if (baseUrl is null)
                return Error.Validation("Checkout.BadReturnUrl",
                    "La URL de retorno no es válida.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, checkouts, discountsDb, createOrder, ct);
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
        }).RequireRateLimiting("payments");

        // Pagar on-site (Checkout API/Bricks): el front tokeniza la tarjeta.
        group.MapPost("/checkout/{id:guid}/pay-onsite", async (
            Guid id,
            PayOnsiteRequest request,
            ITenantContext tenant,
            ICheckoutRepository checkouts,
            DiscountsDbContext discountsDb,
            CreateOrderHandler createOrder,
            SettlePaymentHandler settle,
            IMercadoPagoPaymentService mp,
            OrderNotifier notifier,
            WhatsAppNotifier whatsapp,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.PaymentMethodId))
                return Error.Validation("Payment.MissingToken", "Falta el token de la tarjeta.").ToProblem();

            var orderResult = await BuildOrderAsync(tenant.TenantId, id, request.CouponCode, checkouts, discountsDb, createOrder, ct);
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
            {
                await notifier.NotifyAsync(settleResult.Value.Order, "confirmacion-pago", ct);
                await whatsapp.NotifyAsync(settleResult.Value.Order, "confirmacion-pago", ct);
            }

            return Results.Ok(new { orderId = order.Id, status = card.Status, statusDetail = card.StatusDetail });
        }).RequireRateLimiting("payments");

        // Estado de la orden — PÚBLICO pero mínimo (sin PII). Lo usa la página de
        // "gracias por tu compra" para pollear el resultado del pago sin login.
        group.MapGet("/orders/{id:guid}/status", async (
            Guid id, ITenantContext tenant, IOrderRepository orders, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            return order is null
                ? Results.NotFound()
                : Results.Ok(new { status = order.Status.ToString().ToUpperInvariant() });
        });

        // Detalle completo (con PII) — solo el comprador dueño de la orden o un
        // miembro admin de la tienda. Antes era anónimo y filtraba email/teléfono/
        // dirección/DNI a cualquiera con el id.
        group.MapGet("/orders/{id:guid}", async (
            Guid id, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            Customers.Infrastructure.CustomersDbContext customersDb, IMembershipService memberships, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
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
        });

        group.MapGet("/orders", async (
            ITenantContext tenant, IOrderRepository orders, Guid? after, int? limit, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var items = await orders.ListAsync(tenant.TenantId, Math.Clamp(limit ?? 20, 1, 100), after, ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        }).RequirePermission(Permission.OrdersRead);

        // Marcar despachado (admin). Paid → Fulfilled + tracking + email/WhatsApp de envío.
        group.MapPost("/orders/{id:guid}/fulfill", async (
            Guid id, FulfillRequest req, ITenantContext tenant, IOrderRepository orders, OrderNotifier notifier, WhatsAppNotifier whatsapp, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            if (order is null) return Results.NotFound();
            var r = order.MarkFulfilled(req.Tracking);
            if (r.IsFailure) return r.Error.ToProblem();
            await orders.SaveChangesAsync(ct);
            await notifier.NotifyAsync(order, "confirmacion-envio", ct);
            await whatsapp.NotifyAsync(order, "confirmacion-envio", ct);
            return Results.Ok(ToDto(order));
        }).RequirePermission(Permission.OrdersFulfill);

        // Reembolso total o parcial (admin). MP refund → estado + auditoría + email.
        // Lock por orden + recarga dentro del lock: dos requests concurrentes no
        // disparan dos refunds ni dos emails. La clave de idempotencia hacia MP es
        // el id del registro de auditoría: única por intento, así los parciales
        // sucesivos no se deduplican entre sí pero un retry de red sí.
        group.MapPost("/orders/{id:guid}/refund", async (
            Guid id, RefundRequest req, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            IMercadoPagoPaymentService mp, PaymentsDbContext paymentsDb, OrderNotifier notifier, WhatsAppNotifier whatsapp, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();

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
                    return Error.Validation("Refund.ExceedsRemaining",
                        $"El monto supera lo reembolsable ({remaining}).").ToProblem();

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
                var mpAmount = isTotal && order.RefundedAmount.IsZero ? (decimal?)null : amount.ToDecimal();
                var refund = await mp.RefundAsync(tenant.TenantId, order.PaymentId!, mpAmount, idemKey, ct);
                if (refund.IsFailure) return refund.Error.ToProblem();
                audit.AttachMercadoPagoId(refund.Value.RefundId);

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
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
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

        return group;
    }

    /// <summary>Crea la Order desde un checkout enviado, aplicando el cupón validado server-side.</summary>
    private static async Task<Result<Order>> BuildOrderAsync(
        TenantId tenantId, Guid sessionId, string? couponCode,
        ICheckoutRepository checkouts, DiscountsDbContext discountsDb, CreateOrderHandler createOrder, CancellationToken ct)
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

        var lines = session.Items.Select(i => new CreateOrderLine(
            i.VariantId, i.ProductName, i.VariantDescription, i.Sku, i.UnitPrice, i.Quantity, i.ReservationId)).ToList();

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
            Notes: session.Notes), ct);
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
            i.VariantId, i.ProductName, i.VariantDescription, i.Sku, i.Quantity,
            unitPrice = ApiJson.MoneyJson(i.UnitPrice),
        }),
    };
}

public sealed record FulfillRequest(string? Tracking);

public sealed record RefundRequest(decimal? Amount, string? Reason);

public sealed record PayCheckoutRequest(string? ReturnUrl, string? CouponCode);

public sealed record PayOnsiteRequest(
    string Token,
    string PaymentMethodId,
    int? Installments,
    string? IssuerId,
    string? PayerDocType,
    string? PayerDocNumber,
    string? CouponCode);
