using Orders.Core.Domain;

namespace Api.Orders;

/// <summary>Por dónde vuelve la plata de un reembolso.</summary>
public enum RefundMedium
{
    /// <summary>La venta se cobró con Mercado Pago: el reembolso sale por ahí.</summary>
    MercadoPago,
    /// <summary>Se cobró con tarjeta por Payway: vuelve a esa tarjeta.</summary>
    Payway,
    /// <summary>Venta manual en efectivo: la devuelve la tienda.</summary>
    Cash,
    /// <summary>Venta manual por transferencia: la devuelve la tienda.</summary>
    Transfer,
    /// <summary>Venta a cuenta corriente: no vuelve plata, baja la deuda.</summary>
    CurrentAccount,
    /// <summary>Otra forma de cobro manual.</summary>
    Manual,
}

public static class RefundMediums
{
    /// <summary>
    /// El medio de una venta cobrada a mano, por su forma de cobro. Las que
    /// pasaron por una pasarela se resuelven antes (hay que mirar el intento de
    /// Payway, ver <c>OrderRefundService</c>).
    /// </summary>
    public static RefundMedium ForManual(Order order) => OrderPayment.Of(order) switch
    {
        OrderPayment.Cash => RefundMedium.Cash,
        OrderPayment.Transfer => RefundMedium.Transfer,
        OrderPayment.CurrentAccount => RefundMedium.CurrentAccount,
        _ => RefundMedium.Manual,
    };

    /// <summary>La frase que lee el comprador en el aviso de reembolso parcial ({{refund_method}}).</summary>
    public static string BuyerText(RefundMedium medium) => medium switch
    {
        RefundMedium.MercadoPago =>
            "Vuelve por Mercado Pago al mismo medio con el que pagaste. Según tu banco o tarjeta, puede tardar unos días en verse.",
        RefundMedium.Payway =>
            "Vuelve a la tarjeta con la que pagaste. Según tu banco, puede tardar unos días en verse en el resumen.",
        RefundMedium.Cash => "Te lo devolvemos en efectivo.",
        RefundMedium.Transfer => "Te lo devolvemos por transferencia.",
        // Baja la deuda o, si ya estaba paga, queda a favor: "se acreditó" sirve para las dos.
        RefundMedium.CurrentAccount => "Se acreditó en tu cuenta corriente con la tienda.",
        _ => "Te lo devolvemos nosotros. Si tenés dudas, escribinos.",
    };
}
