using System.Globalization;
using System.Text.RegularExpressions;
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
public sealed partial class StoreDraftSources(
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

        var order = await ReadOrderAsync(conversation.OrderId, ct);
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

        // El seguimiento se lee acá y no dentro de la herramienta: así la herramienta no toca la base (un lector
        // que se pasa de su tope dejaría una consulta corriendo en el DbContext del request).
        var statusText = OrderStatusText(order);
        var tracking = await TrackingAsync(order, ct);
        var readers = new DraftReaders(
            OrderStatus: _ => Task.FromResult(statusText),
            Tracking: _ => Task.FromResult(tracking));
        List<string> references = [order.Label, .. tracking.References ?? []];
        return new DraftSubject(DraftChannel.SupportChat, thread, $"Pedido {order.Label}", KnownAmounts(order), references, readers);
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
            DraftChannel.Contact, thread, "Mensaje enviado desde el formulario de contacto de la tienda.", [], [], new DraftReaders());
    }

    /// <summary>
    /// Lee el pedido y lo pasa enseguida a <see cref="OrderView"/>: la entidad no sale de acá, así que su dirección,
    /// nombre, mail y teléfono no llegan a ningún lector. El total es el del dominio (<see cref="Order.Total"/>).
    /// </summary>
    private async Task<OrderView?> ReadOrderAsync(Guid orderId, CancellationToken ct)
    {
        var order = await orders.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId, ct);
        return order is null
            ? null
            : new OrderView(
                order.Id, order.Label, order.Status, order.IsPickup, order.CreatedAtUtc, order.ShippingCost, order.Total,
                order.RefundedAmount, order.Tracking, order.ShippingMethodName, order.FulfilledAtUtc,
                [.. order.Items.Select(i => new ItemView(i.ProductName, i.VariantDescription, i.Quantity, i.UnitPrice))]);
    }

    /// <summary>Total, envío, lo devuelto, y precio unitario y subtotal (unitario × cantidad) de cada línea, en centavos.</summary>
    private static HashSet<long> KnownAmounts(OrderView order)
    {
        var amounts = new HashSet<long>();
        void Add(Money money)
        {
            if (money.AmountInMinorUnits > 0) amounts.Add(money.AmountInMinorUnits);
        }

        Add(order.Total);
        Add(order.ShippingCost);
        Add(order.RefundedAmount);
        foreach (var item in order.Items)
        {
            Add(item.UnitPrice);
            Add(item.UnitPrice * item.Quantity);
        }
        return amounts;
    }

    /// <summary>Estado, retiro o envío, productos y montos. Sin dirección, mail ni teléfono del comprador.</summary>
    private static string OrderStatusText(OrderView order)
    {
        var lines = new List<string>
        {
            $"Pedido {order.Label}.",
            $"Estado: {OrderCsv.StatusLabel(order.Status, order.IsPickup)}.",
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

    private static string Describe(ItemView item) =>
        string.IsNullOrWhiteSpace(item.VariantDescription) ? item.ProductName : $"{item.ProductName} ({item.VariantDescription})";

    private static string Amount(Money money) => OrderTexts.MoneyText(money.ToDecimal(), money.Currency);

    /// <summary>
    /// Transportista, número y estado, con lo mismo que lee <see cref="OrderTrackingView"/>. Nunca la URL: el
    /// aviso de links del borrador la marcaría. No hay fecha estimada de entrega que prometer. El número que se
    /// muestra va también en <see cref="TrackingInfo.References"/>.
    /// </summary>
    private async Task<TrackingInfo> TrackingAsync(OrderView order, CancellationToken ct)
    {
        if (order.IsPickup) return new TrackingInfo("El pedido se retira en el local: no hay envío.", false);

        var andreani = await checkout.AndreaniShipments.AsNoTracking()
            .Where(s => s.OrderId == order.Id)
            .Select(s => new { s.TrackingNumber, s.Status })
            .FirstOrDefaultAsync(ct);
        var zipnova = await checkout.ZipnovaShipments.AsNoTracking()
            .Where(s => s.OrderId == order.Id)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => new { s.CarrierName, s.CarrierTrackingId, s.TrackingUrl, s.Status })
            .FirstOrDefaultAsync(ct);

        var tracking = CarrierTrackingLink.For(
            order.Tracking, order.ShippingMethodName, andreani?.TrackingNumber,
            zipnova is null ? null : (zipnova.CarrierName, zipnova.CarrierTrackingId, zipnova.TrackingUrl));

        var lines = new List<string>();
        List<string> references = [];
        if (tracking?.Carrier is { } carrier) lines.Add($"Transportista: {carrier}.");
        if (tracking?.Number is { } number)
        {
            // El número que cargó el comercio a mano es texto libre: solo pasa si es un código.
            if (IsTrackingCode(number))
            {
                lines.Add($"Número de seguimiento: {number}.");
                references.Add(number);
            }
            else
            {
                lines.Add("Hay un seguimiento cargado, pero no se puede mostrar acá.");
            }
        }
        var state = andreani is not null ? AndreaniState(andreani.Status) : zipnova is not null ? ZipnovaState(zipnova.Status) : null;
        if (state is not null) lines.Add($"Estado del envío: {state}.");
        if (order.FulfilledAtUtc is { } sent)
            lines.Add($"Despachado el {ArgentinaTime.ToLocal(sent).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.");

        return new TrackingInfo(
            lines.Count == 0 ? "Todavía no hay datos de seguimiento del envío." : string.Join("\n", lines),
            HasDeliveryEstimate: false,
            references);
    }

    /// <summary>Letras, dígitos, guiones y espacios simples, hasta 40 caracteres.</summary>
    private static bool IsTrackingCode(string number) =>
        number.Length <= 40 && CodePattern().IsMatch(number);

    [GeneratedRegex(@"^[A-Za-z0-9-]+( [A-Za-z0-9-]+)*$")]
    private static partial Regex CodePattern();

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

    private sealed record ItemView(string ProductName, string VariantDescription, int Quantity, Money UnitPrice);

    /// <summary>El pedido, reducido a lo que se usa.</summary>
    private sealed record OrderView(
        Guid Id, string Label, OrderStatus Status, bool IsPickup, DateTime CreatedAtUtc, Money ShippingCost, Money Total,
        Money RefundedAmount, string? Tracking, string? ShippingMethodName, DateTime? FulfilledAtUtc, IReadOnlyList<ItemView> Items);
}
