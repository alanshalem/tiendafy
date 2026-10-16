using SharedKernel.Common;

namespace Fiscal.Core.Domain;

/// <summary>
/// Las claves de idempotencia de las notas de crédito de una venta. Una venta
/// puede tener varias NC (una por reembolso o ajuste), y cada pedido de NC
/// lleva su clave: el mismo reembolso, el mismo aviso de la pasarela o el
/// mismo pedido manual repetidos dan la misma clave y no emiten otra.
/// </summary>
public static class CreditNoteKeys
{
    /// <summary>Un reembolso hecho desde el panel (el id de su registro de auditoría).</summary>
    public static string ForRefund(Guid refundId) => $"reembolso:{refundId:N}";

    /// <summary>
    /// Un reembolso que informó la pasarela (Mercado Pago), que no tiene un
    /// registro propio: lo identifica el tramo devuelto (lo devuelto antes y
    /// después, en centavos). El mismo aviso repetido da la misma clave.
    /// </summary>
    public static string ForGatewayRefund(long refundedBeforeMinor, long refundedAfterMinor) =>
        $"reembolso-pasarela:{refundedBeforeMinor}-{refundedAfterMinor}";

    /// <summary>Un pedido manual desde el panel, con la clave que mandó el panel.</summary>
    public static string ForManual(string clientKey) => $"manual:{clientKey.Trim()}";

    /// <summary>La cancelación de una venta de Mercado Libre (una sola por venta).</summary>
    public const string MeliCancellation = "ml-cancelacion";

    /// <summary>
    /// Una devolución parcial de una venta de Mercado Libre: como la de la
    /// pasarela, la identifica el tramo devuelto (lo devuelto antes y después,
    /// en centavos). El mismo aviso de ML repetido da la misma clave.
    /// </summary>
    public static string ForMeliRefund(long refundedBeforeMinor, long refundedAfterMinor) =>
        $"ml-reembolso:{refundedBeforeMinor}-{refundedAfterMinor}";

    /// <summary>Clave manual aceptable: no vacía, corta y sin espacios raros.</summary>
    public static bool IsValidClientKey(string? key) =>
        !string.IsNullOrWhiteSpace(key) && key.Trim().Length is >= 8 and <= 64
        && key.Trim().All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}

/// <summary>
/// El tope de lo que se puede acreditar: la suma de las notas de crédito de
/// una factura (las autorizadas más las que están en curso) nunca supera el
/// total de esa factura. ARCA solo lo observa (10237); acá se corta antes.
/// Todo en centavos.
/// </summary>
public static class CreditNoteLimit
{
    /// <summary>Lo que queda por acreditar.</summary>
    public static long Remaining(long invoiceTotalMinor, long creditedMinor, long inFlightMinor) =>
        Math.Max(0, invoiceTotalMinor - creditedMinor - inFlightMinor);

    /// <summary>Un pedido explícito (a mano): o entra entero, o es un error que dice cuánto queda.</summary>
    public static Result<long> Check(long invoiceTotalMinor, long creditedMinor, long inFlightMinor, long requestedMinor)
    {
        if (requestedMinor <= 0)
            return Result.Failure<long>(Error.Validation(CreditNoteErrors.InvalidAmount,
                "El monto de la nota de crédito tiene que ser mayor a cero."));

        var remaining = Remaining(invoiceTotalMinor, creditedMinor, inFlightMinor);
        if (requestedMinor > remaining)
            return Result.Failure<long>(Error.Validation(CreditNoteErrors.ExceedsInvoice,
                remaining == 0
                    ? "La factura ya está acreditada entera: no queda nada por acreditar."
                    : $"Supera lo que queda por acreditar de la factura (${ArgentineNumbers.Number(remaining / 100m, 2)})."));
        return requestedMinor;
    }

    /// <summary>
    /// Un reembolso (automático): se acredita lo devuelto, pero nunca más de lo
    /// que queda de la factura. Cero = no hay nada que acreditar.
    /// </summary>
    public static long Clamp(long invoiceTotalMinor, long creditedMinor, long inFlightMinor, long requestedMinor) =>
        Math.Clamp(requestedMinor, 0, Remaining(invoiceTotalMinor, creditedMinor, inFlightMinor));

    /// <summary>Un importe de comprobante (pesos con centavos) en centavos.</summary>
    public static long ToMinor(decimal amount) => (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
}

/// <summary>Códigos de error de las notas de crédito que el panel distingue.</summary>
public static class CreditNoteErrors
{
    public const string InvalidAmount = "CreditNote.InvalidAmount";
    public const string ExceedsInvoice = "CreditNote.ExceedsInvoice";
    public const string NoInvoice = "Fiscal.NoOriginalInvoice";
}
