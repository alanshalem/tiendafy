using Checkout.Core.Domain;

namespace Checkout.Infrastructure.Carriers;

/// <summary>
/// Traduce los estados de Andreani a los de Tiendafy.
///
/// Andreani <b>no publica su catálogo de estados</b>: los únicos valores
/// conocidos aparecen sueltos dentro de los ejemplos de la documentación. Por
/// eso el mapeo cubre lo que se conoce y manda todo lo demás a
/// <see cref="AndreaniShipmentStatus.Unknown"/> — sin inventar, sin notificar
/// al comprador y guardando siempre el estado crudo para poder ampliarlo.
///
/// Las tablas que circulan por la web con nombres como "En tránsito" o
/// "Entrega fallida" no corresponden a valores reales de la API.
/// </summary>
public static class AndreaniStatusMap
{
    /// <summary>Estado de una traza (<c>EstadoId</c>) → estado nuestro.</summary>
    public static string FromTrace(int stateId, string? stateName) => stateId switch
    {
        1 => AndreaniShipmentStatus.Created,             // Pendiente de ingreso
        5 => AndreaniShipmentStatus.Dispatched,          // Ingreso al circuito operativo
        6 => AndreaniShipmentStatus.OutForDelivery,      // En distribución
        11 => AndreaniShipmentStatus.DeliveryAttemptFailed, // Visita
        _ => FromName(stateName),
    };

    /// <summary>
    /// Último recurso: interpretar el nombre del estado. Los ids que faltan
    /// —entregado, disponible para retiro, devuelto— no están documentados, y
    /// reconocer el texto es mejor que dejar todo en desconocido. Se mantiene
    /// conservador: ante la duda, desconocido.
    /// </summary>
    private static string FromName(string? stateName)
    {
        var name = (stateName ?? "").Trim().ToLowerInvariant();
        if (name.Length == 0) return AndreaniShipmentStatus.Unknown;

        if (name.Contains("entregad")) return AndreaniShipmentStatus.Delivered;
        if (name.Contains("disponible") || name.Contains("retiro") || name.Contains("sucursal destino"))
            return AndreaniShipmentStatus.AvailableForPickup;
        if (name.Contains("devolucion") || name.Contains("devolución") || name.Contains("remitente"))
            return AndreaniShipmentStatus.ReturnedToSender;
        if (name.Contains("distribucion") || name.Contains("distribución") || name.Contains("reparto"))
            return AndreaniShipmentStatus.OutForDelivery;
        if (name.Contains("visita")) return AndreaniShipmentStatus.DeliveryAttemptFailed;
        if (name.Contains("transito") || name.Contains("tránsito")) return AndreaniShipmentStatus.InTransit;

        return AndreaniShipmentStatus.Unknown;
    }

    /// <summary>Etiqueta corta para el panel.</summary>
    public static string AdminLabel(string status) => status switch
    {
        AndreaniShipmentStatus.Created => "Generado",
        AndreaniShipmentStatus.Dispatched => "Despachado",
        AndreaniShipmentStatus.InTransit => "En tránsito",
        AndreaniShipmentStatus.OutForDelivery => "En reparto",
        AndreaniShipmentStatus.DeliveryAttemptFailed => "Visita fallida",
        AndreaniShipmentStatus.AvailableForPickup => "En sucursal",
        AndreaniShipmentStatus.Delivered => "Entregado",
        AndreaniShipmentStatus.ReturnedToSender => "Devuelto",
        _ => "Sin novedades",
    };
}
