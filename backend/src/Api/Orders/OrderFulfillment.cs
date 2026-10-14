using Api.Middleware;
using Api.Notifications;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// Marcar una venta como enviada (o lista para retirar) con todo lo que eso
/// dispara: el aviso al comprador por email y WhatsApp, y la factura
/// automática si la tienda factura "al despachar".
///
/// Vive acá porque lo usan dos caminos —una venta desde su detalle y varias
/// de una vez desde el listado— y una lista de efectos copiada en dos lugares
/// es la que termina divergiendo.
///
/// Los avisos son best-effort, como en <see cref="PaidOrderSideEffects"/>: la
/// venta ya quedó enviada; un email caído no puede devolver un error que haga
/// pensar que no (antes daba 500 con el estado ya cambiado).
/// </summary>
public sealed class OrderFulfillment(
    IOrderRepository orders,
    OrderNotifier notifier,
    WhatsAppNotifier whatsapp,
    IFiscalEmissionQueue fiscal,
    ILogger<OrderFulfillment> logger)
{
    public async Task<Result<Order>> FulfillAsync(TenantId tenantId, Guid orderId, string? tracking, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(tenantId, orderId, ct);
        if (order is null) return Result.Failure<Order>(Error.NotFound("Order", orderId));

        var marked = order.MarkFulfilled(tracking);
        if (marked.IsFailure) return Result.Failure<Order>(marked.Error);
        await orders.SaveChangesAsync(ct);

        // Retiro en el local: el aviso es "listo para retirar", no "en camino".
        var notice = order.IsPickup ? "lista-para-retirar" : "confirmacion-envio";
        await StepAsync("email de envío", order, () => notifier.NotifyAsync(order, notice, ct));
        await StepAsync("WhatsApp de envío", order, () => whatsapp.NotifyAsync(order, notice, ct));
        // Factura automática si el trigger configurado es "al despachar".
        await StepAsync("factura al despachar", order, () => fiscal.EnqueueInvoiceAsync(
            tenantId.Value, order.Id, order.Total.AmountInMinorUnits,
            order.DocNumber, EmissionTrigger.OnFulfillment, ct));
        return order;
    }

    /// <summary>
    /// Varias ventas de una vez, cada una por su lado: lo que pase con una no
    /// frena ni deshace a las demás, y el resultado dice qué pasó con cada una
    /// para que el panel pueda contarlo ("8 marcadas, 2 no").
    ///
    /// Cada venta corre en su propio scope (su propio DbContext), como si
    /// fuera un request aparte: si una falla al guardar —otra persona la tocó
    /// al mismo tiempo— no queda colgada en el contexto y no arrastra el
    /// guardado de las que vienen atrás.
    /// </summary>
    public static async Task<IReadOnlyList<BulkFulfillOutcome>> FulfillManyAsync(
        IServiceScopeFactory scopes, TenantId tenantId, IReadOnlyList<Guid> orderIds, CancellationToken ct)
    {
        var outcomes = new List<BulkFulfillOutcome>(orderIds.Count);
        foreach (var id in orderIds.Distinct())
        {
            await using var scope = scopes.CreateAsyncScope();
            scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(tenantId);
            var repository = scope.ServiceProvider.GetRequiredService<IOrderRepository>();

            var order = await repository.GetByIdAsync(tenantId, id, ct);
            if (order is null)
            {
                outcomes.Add(BulkFulfillOutcome.Failed(id, "La venta no existe en esta tienda."));
                continue;
            }
            // Ya enviada: no se vuelve a avisar al comprador (el detalle sí lo
            // hace, para mandar un seguimiento corregido; acá no hay seguimiento).
            if (order.Status == OrderStatus.Fulfilled)
            {
                outcomes.Add(new BulkFulfillOutcome(id, "skipped", "Ya estaba enviada.", order.Label));
                continue;
            }
            if (order.Status != OrderStatus.Paid)
            {
                outcomes.Add(BulkFulfillOutcome.Failed(id, NotFulfillableReason(order.Status), order.Label));
                continue;
            }

            try
            {
                var fulfillment = scope.ServiceProvider.GetRequiredService<OrderFulfillment>();
                var result = await fulfillment.FulfillAsync(tenantId, id, tracking: null, ct);
                outcomes.Add(result.IsSuccess
                    ? new BulkFulfillOutcome(id, "fulfilled", null, order.Label)
                    : BulkFulfillOutcome.Failed(id, result.Error.Message, order.Label));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                scope.ServiceProvider.GetRequiredService<ILogger<OrderFulfillment>>()
                    .LogError(ex, "Falló el despacho en lote de la venta {OrderId}.", id);
                outcomes.Add(BulkFulfillOutcome.Failed(id, "No se pudo guardar. Probá de nuevo con esa sola.", order.Label));
            }
        }
        return outcomes;
    }

    /// <summary>Por qué no se despacha, en palabras del comercio (el estado crudo no le dice nada).</summary>
    private static string NotFulfillableReason(OrderStatus status) => status switch
    {
        OrderStatus.PendingPayment => "Todavía no está cobrada.",
        OrderStatus.Refunded or OrderStatus.PartiallyRefunded => "Tiene un reembolso: revisala antes de despacharla.",
        OrderStatus.Cancelled => "Está cancelada.",
        OrderStatus.Failed => "El pago fue rechazado.",
        OrderStatus.ChargedBack => "Tiene un contracargo.",
        _ => "No está en condiciones de despacharse.",
    };

    private async Task StepAsync(string step, Order order, Func<Task> run)
    {
        try
        {
            await run();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Falló el {Step} de la venta despachada {OrderId}.", step, order.Id);
        }
    }
}

/// <summary>Lo que pasó con una venta del lote: <c>fulfilled</c>, <c>skipped</c> (ya estaba) o <c>failed</c>.</summary>
public sealed record BulkFulfillOutcome(Guid Id, string Result, string? Reason, string? Label = null)
{
    public static BulkFulfillOutcome Failed(Guid id, string reason, string? label = null) => new(id, "failed", reason, label);

    /// <summary>Cómo se la nombra en el panel: "#1042" (o el id corto si no se encontró).</summary>
    public string Number => Label ?? OrderLabel.For(0, Id);
}
