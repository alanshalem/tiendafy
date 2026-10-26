using System.Globalization;
using Api.Orders;
using Api.Shipping;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;
using Support.Infrastructure;

namespace Api.Ai.Questions;

/// <summary>
/// Arma el <see cref="DraftSubject"/> de un chat posventa de la tienda o de un mensaje de contacto leyéndolo en
/// el servidor: el navegador solo manda el id. Todo es lectura y sin seguimiento de cambios: no marca leído el
/// chat (<c>UnreadForStaff</c>) ni el mensaje. Del cliente no entra su mail (el <c>AuthorName</c> de sus
/// mensajes lo es), ni su nombre, teléfono o dirección; del pedido, solo lo que sirve para contestar.
/// </summary>
public sealed class StoreDraftSources(
    SupportDbContext support, OrdersDbContext orders, CheckoutDbContext checkout, CustomersDbContext customers)
{
    /// <summary>Cuántos mensajes del chat, los últimos, se leen (los que después pasan al modelo).</summary>
    private const int ChatMessages = QuestionDraftService.ThreadLines;

    private const string AttachmentOnly = "[adjunto]";

    public async Task<Result<DraftSubject>> SupportConversationAsync(Guid conversationId, CancellationToken ct)
    {
        var conversation = await support.Conversations.AsNoTracking()
            .Where(c => c.Id == conversationId)
            .Select(c => new { c.OrderId })
            .FirstOrDefaultAsync(ct);
        if (conversation is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

        var order = await orders.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == conversation.OrderId, ct);
        if (order is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

        // Sin AuthorName: en los mensajes del cliente es su mail.
        var recent = await support.Messages.AsNoTracking()
            .Where(m => m.ConversationId == conversationId)
            .OrderByDescending(m => m.CreatedAtUtc)
            .Take(ChatMessages)
            .Select(m => new { m.IsFromStaff, m.Body, HasAttachment = m.AttachmentKey != null })
            .ToListAsync(ct);
        var thread = recent.AsEnumerable().Reverse()
            .Select(m => new ThreadLine(m.IsFromStaff, string.IsNullOrWhiteSpace(m.Body)
                ? (m.HasAttachment ? AttachmentOnly : "")
                : m.Body))
            .ToList();
        if (!thread.Any(l => !l.FromSeller && !string.IsNullOrWhiteSpace(l.Text)))
            return Result.Failure<DraftSubject>(QuestionDraftErrors.NothingToAnswer);

        var statusText = OrderStatusText(order);
        var shipment = new ShipmentInput(order.Id, order.IsPickup, order.Tracking, order.ShippingMethodName, order.FulfilledAtUtc);
        var readers = new DraftReaders(
            OrderStatus: _ => Task.FromResult(statusText),
            Tracking: readerCt => TrackingAsync(shipment, readerCt));
        return new DraftSubject(DraftChannel.SupportChat, thread, $"Pedido {order.Label}", KnownAmounts(order), readers);
    }

    public async Task<Result<DraftSubject>> ContactAsync(Guid contactMessageId, CancellationToken ct)
    {
        // Solo el cuerpo: ni el nombre ni el mail del remitente se leen.
        var message = await customers.ContactMessages.AsNoTracking()
            .Where(m => m.Id == contactMessageId)
            .Select(m => new { m.Body })
            .FirstOrDefaultAsync(ct);
        if (message is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

        var key = contactMessageId.ToString();
        var replies = await support.InboxReplies.AsNoTracking()
            .Where(r => r.Channel == InboxChannel.Contact && r.ExternalId == key)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Take(QuestionDraftService.ThreadLines - 1)
            .Select(r => r.Body)
            .ToListAsync(ct);

        // El mensaje original va siempre primero (el recorte del servicio no lo deja afuera); después, lo que
        // ya se contestó, de la más vieja a la más nueva.
        List<ThreadLine> thread = [new(FromSeller: false, message.Body)];
        thread.AddRange(Enumerable.Reverse(replies).Select(body => new ThreadLine(FromSeller: true, body)));
        return new DraftSubject(
            DraftChannel.Contact, thread, "Mensaje enviado desde el formulario de contacto de la tienda.", [], new DraftReaders());
    }

    /// <summary>Total, envío y precio unitario de cada línea, en centavos.</summary>
    private static HashSet<long> KnownAmounts(Order order)
    {
        var amounts = new HashSet<long>();
        void Add(Money money)
        {
            if (money.AmountInMinorUnits > 0) amounts.Add(money.AmountInMinorUnits);
        }

        Add(order.Total);
        Add(order.ShippingCost);
        foreach (var item in order.Items) Add(item.UnitPrice);
        return amounts;
    }

    /// <summary>Estado, retiro o envío, productos y montos. Sin dirección, mail ni teléfono del comprador.</summary>
    private static string OrderStatusText(Order order)
    {
        var lines = new List<string>
        {
            $"Pedido {order.Label}.",
            $"Estado: {OrderCsv.StatusLabel(order)}.",
            $"Fecha de la compra: {ArgentinaTime.ToLocal(order.CreatedAtUtc).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.",
            order.IsPickup ? "Entrega: retiro en el local." : "Entrega: envío a domicilio.",
        };
        if (order.Items.Count > 0)
        {
            lines.Add("Productos: " + string.Join("; ", order.Items.Select(i =>
                $"{i.Quantity} x {OrderTexts.Title(Describe(i))} a {Amount(i.UnitPrice)} c/u")) + ".");
        }
        if (!order.IsPickup) lines.Add($"Envío: {Amount(order.ShippingCost)}.");
        lines.Add($"Total: {Amount(order.Total)}.");
        if (order.RefundedAmount.AmountInMinorUnits > 0) lines.Add($"Devuelto al comprador: {Amount(order.RefundedAmount)}.");
        return string.Join("\n", lines);
    }

    private static string Describe(OrderItem item) =>
        string.IsNullOrWhiteSpace(item.VariantDescription) ? item.ProductName : $"{item.ProductName} ({item.VariantDescription})";

    private static string Amount(Money money) => OrderTexts.MoneyText(money.ToDecimal(), money.Currency);

    /// <summary>
    /// Transportista, número y estado, con lo mismo que lee <see cref="OrderTrackingView"/>. Nunca la URL: el
    /// aviso de links del borrador la marcaría. No hay fecha estimada de entrega que prometer.
    /// </summary>
    private async Task<TrackingInfo> TrackingAsync(ShipmentInput shipment, CancellationToken ct)
    {
        if (shipment.IsPickup) return new TrackingInfo("El pedido se retira en el local: no hay envío.", false);

        var andreani = await checkout.AndreaniShipments.AsNoTracking()
            .Where(s => s.OrderId == shipment.OrderId)
            .Select(s => new { s.TrackingNumber, s.Status })
            .FirstOrDefaultAsync(ct);
        var zipnova = await checkout.ZipnovaShipments.AsNoTracking()
            .Where(s => s.OrderId == shipment.OrderId)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => new { s.CarrierName, s.CarrierTrackingId, s.TrackingUrl, s.Status })
            .FirstOrDefaultAsync(ct);

        var tracking = CarrierTrackingLink.For(
            shipment.Tracking, shipment.ShippingMethodName, andreani?.TrackingNumber,
            zipnova is null ? null : (zipnova.CarrierName, zipnova.CarrierTrackingId, zipnova.TrackingUrl));

        var lines = new List<string>();
        if (tracking?.Carrier is { } carrier) lines.Add($"Transportista: {carrier}.");
        if (tracking?.Number is { } number) lines.Add($"Número de seguimiento: {number}.");
        var state = andreani is not null ? AndreaniState(andreani.Status) : zipnova is not null ? ZipnovaState(zipnova.Status) : null;
        if (state is not null) lines.Add($"Estado del envío: {state}.");
        if (shipment.FulfilledAtUtc is { } sent)
            lines.Add($"Despachado el {ArgentinaTime.ToLocal(sent).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.");

        return new TrackingInfo(
            lines.Count == 0 ? "Todavía no hay datos de seguimiento del envío." : string.Join("\n", lines),
            HasDeliveryEstimate: false);
    }

    private static string? AndreaniState(string status) => status switch
    {
        AndreaniShipmentStatus.Created => "creado, todavía no lo retiró el correo",
        AndreaniShipmentStatus.Dispatched => "despachado",
        AndreaniShipmentStatus.InTransit => "en camino",
        AndreaniShipmentStatus.OutForDelivery => "salió a entregarse",
        AndreaniShipmentStatus.DeliveryAttemptFailed => "falló un intento de entrega",
        AndreaniShipmentStatus.AvailableForPickup => "disponible para retirar en la sucursal",
        AndreaniShipmentStatus.Delivered => "entregado",
        AndreaniShipmentStatus.ReturnedToSender => "devuelto al remitente",
        _ => null,
    };

    private static string? ZipnovaState(string status) => status.ToLowerInvariant() switch
    {
        "new" => "creado, todavía no lo retiró el correo",
        "ready_to_ship" => "listo para despachar",
        "shipped" => "en camino",
        "delivered" => "entregado",
        "cancelled" => "cancelado",
        _ => null,
    };

    /// <summary>Lo único del pedido que necesita el lector de seguimiento (corre más tarde, dentro de la herramienta).</summary>
    private sealed record ShipmentInput(
        Guid OrderId, bool IsPickup, string? Tracking, string? ShippingMethodName, DateTime? FulfilledAtUtc);
}
