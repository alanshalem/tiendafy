using System.Globalization;
using System.Text.Json;
using Api.Meli;
using MercadoLibre.Infrastructure;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Los textos que las herramientas de posventa le devuelven al modelo: el estado de la venta (del cache local)
/// y el seguimiento del envío (de <c>GET /shipments/{id}</c>). Solo trae lo que sirve para contestar; del
/// comprador no entra el nickname, el nombre ni la dirección.
/// </summary>
public static class OrderTexts
{
    public const string NoShipment = "Sin datos de envío.";

    /// <summary>Cuántos caracteres del número de seguimiento llegan al modelo.</summary>
    private const int MaxTrackingChars = 40;

    private const int MaxTitleChars = 100;

    public static string MoneyText(decimal amount, string? currency)
    {
        var number = ArgentineNumbers.Number(amount, amount % 1 == 0 ? 0 : 2);
        return currency is null or Money.DefaultCurrency ? $"$ {number}" : $"{currency} {number}";
    }

    public static string Title(string? title) => Text.Clip(title?.ReplaceLineEndings(" "), MaxTitleChars) ?? "(sin título)";

    /// <summary>Estado, fecha, productos, montos y estado del envío de las ventas del pack, tal como las tiene el cache.</summary>
    public static string OrderStatus(IReadOnlyList<MeliOrder> orders)
    {
        var blocks = orders.Select((o, i) =>
        {
            var lines = new List<string>();
            if (orders.Count > 1) lines.Add($"Compra {i + 1} de {orders.Count}:");
            lines.Add($"Estado de la venta: {SaleStatus(o.Status)}.");
            lines.Add($"Fecha de la compra: {ArgentinaTime.ToLocal(o.DateCreatedUtc).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.");
            var items = MeliSyncService.ParseSnapshot(o.ItemsJson);
            if (items.Count > 0)
            {
                lines.Add("Productos: " + string.Join("; ", items.Select(it =>
                    $"{it.Quantity} x {Title(it.Title)} a {MoneyText(it.UnitPrice, o.CurrencyId)} c/u")) + ".");
            }
            lines.Add($"Total: {MoneyText(o.TotalAmount, o.CurrencyId)}. Pagado: {MoneyText(o.PaidAmount, o.CurrencyId)}.");
            if (o.RefundedAmount > 0) lines.Add($"Devuelto al comprador: {MoneyText(o.RefundedAmount, o.CurrencyId)}.");
            lines.Add(o.ShipmentStatus is null
                ? "Estado del envío: sin datos de envío."
                : $"Estado del envío: {ShipmentStatus(o.ShipmentStatus)}.");
            return string.Join("\n", lines);
        });
        return string.Join("\n\n", blocks);
    }

    /// <summary>
    /// Lo que dice <c>GET /shipments/{id}</c> (formato nuevo): la línea de la fecha estimada va PRIMERA, así el
    /// recorte de la herramienta no se la esconde al modelo; después estado, subestado y número de seguimiento.
    /// La fecha solo se informa si el envío sigue en curso.
    /// </summary>
    public static TrackingInfo Tracking(JsonElement shipment)
    {
        var status = JsonRead.GetString(shipment, "status");
        var lines = new List<string>();

        var inProgress = status is not ("delivered" or "cancelled" or "not_delivered");
        var estimate = inProgress ? EstimatedDelivery(shipment) : null;
        if (estimate is { } date) lines.Add($"Fecha estimada de entrega: {date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.");

        lines.Add($"Estado del envío: {ShipmentStatus(status)}.");
        if (Substatus(JsonRead.GetString(shipment, "substatus")) is { } sub) lines.Add($"Detalle: {sub}.");
        var number = Text.Clip(JsonRead.GetString(shipment, "tracking_number")?.ReplaceLineEndings(" "), MaxTrackingChars);
        if (number is not null) lines.Add($"Número de seguimiento: {number}.");

        // El número que le pasamos al modelo puede volver en el borrador: no es un dato del comprador.
        return new TrackingInfo(string.Join("\n", lines), estimate is not null, number is null ? [] : [number]);
    }

    /// <summary>La promesa de entrega al comprador (<c>lead_time.estimated_delivery_time.date</c>), en hora argentina.</summary>
    private static DateTime? EstimatedDelivery(JsonElement shipment)
    {
        if (!shipment.TryGetProperty("lead_time", out var leadTime) || leadTime.ValueKind != JsonValueKind.Object) return null;
        if (!leadTime.TryGetProperty("estimated_delivery_time", out var promise) || promise.ValueKind != JsonValueKind.Object) return null;
        var raw = JsonRead.GetString(promise, "date");
        return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? ArgentinaTime.ToLocal(parsed.UtcDateTime)
            : null;
    }

    private static string SaleStatus(string? status) => status switch
    {
        "paid" => "pagada",
        "partially_refunded" => "con una devolución parcial",
        "refunded" => "reembolsada",
        "cancelled" => "cancelada",
        "confirmed" or "payment_required" or "payment_in_process" => "pendiente de pago",
        null or "" => "desconocido",
        _ => status,
    };

    private static string ShipmentStatus(string? status) => status switch
    {
        "to_be_agreed" => "a coordinar con el vendedor",
        "pending" => "pendiente",
        "handling" => "en preparación",
        "ready_to_ship" => "listo para despachar",
        "shipped" => "en camino",
        "delivered" => "entregado",
        "not_delivered" => "no entregado",
        "cancelled" => "cancelado",
        null or "" => "desconocido",
        _ => status,
    };

    private static string? Substatus(string? substatus) => substatus switch
    {
        "ready_to_print" or "printed" or "waiting_for_label_generation" => "el paquete se está preparando",
        "picked_up" or "authorized_by_carrier" => "el correo ya retiró el paquete",
        "in_hub" => "está en un centro de distribución",
        "out_for_delivery" => "salió a entregarse",
        "delayed" => "el envío tiene una demora",
        "waiting_for_withdrawal" => "espera que lo retiren en la sucursal",
        "returned_to_hub" => "volvió al centro de distribución",
        _ => null,
    };
}
