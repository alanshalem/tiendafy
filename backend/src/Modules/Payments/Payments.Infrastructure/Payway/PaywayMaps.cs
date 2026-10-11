using System.Text.Json;
using Payments.Contracts;
using SharedKernel.Common;

namespace Payments.Infrastructure.Payway;

/// <summary>
/// Traduce el vocabulario de Payway al del proyecto: veinte estados a seis, y
/// códigos de rechazo del emisor a algo que se le pueda decir a una persona.
/// </summary>
public static class PaywayMaps
{
    /// <summary>
    /// Estado de Payway → estado nuestro.
    ///
    /// El caso por defecto es <see cref="PaywayPaymentStatus.Unknown"/> a
    /// propósito, y el llamador loguea los que caen ahí. Asumir "aprobado"
    /// ante un estado desconocido despacharía mercadería sin cobrar; asumir
    /// "rechazado" perdería ventas ya cobradas. No saber es un estado válido.
    /// </summary>
    public static PaywayPaymentStatus Status(string? raw) => (raw ?? "").Trim().ToLowerInvariant() switch
    {
        "approved" => PaywayPaymentStatus.Approved,
        "rejected" or "group_rejected" => PaywayPaymentStatus.Declined,
        "review" => PaywayPaymentStatus.UnderReview,
        // Con espacio, no guion bajo: así los serializa la API.
        "challenge pending" or "fingerprint pending" => PaywayPaymentStatus.RequiresAction,
        "pre_approved" => PaywayPaymentStatus.Authorized,
        "annulled" or "annulment_approved" or "refunded"
            or "refund_approved" or "approved_with_refund" or "group_annulled" => PaywayPaymentStatus.Refunded,
        _ => PaywayPaymentStatus.Unknown,
    };

    /// <summary>
    /// Código de rechazo → categoría, si conviene reintentar y qué mostrarle al
    /// comprador. Los códigos salen de las tablas de referencia de Visa,
    /// Mastercard y Amex, cruzadas contra las que emite de verdad la v2 según
    /// el gateway de Decidir de ActiveMerchant.
    /// </summary>
    public static PaywayDecline Decline(int code, string? description)
    {
        var (category, retryable, message) = code switch
        {
            51 or 61 => (PaywayDeclineCategory.InsufficientFunds, true,
                "No hay fondos suficientes. Probá con otra tarjeta o consultá con tu banco."),

            54 => (PaywayDeclineCategory.CardExpired, true,
                "La tarjeta está vencida. Probá con otra."),

            14 or 39 or 46 => (PaywayDeclineCategory.InvalidCardNumber, true,
                "Revisá el número de tarjeta: parece que hay un error."),

            49 => (PaywayDeclineCategory.InvalidExpiryDate, true,
                "La fecha de vencimiento no es correcta. Revisala y volvé a intentar."),

            38 or 55 => (PaywayDeclineCategory.IncorrectPin, true,
                "El PIN ingresado no es correcto."),

            1 or 2 or 76 or 91 => (PaywayDeclineCategory.CallIssuer, false,
                "Tu banco necesita autorizar esta compra. Llamá al número que figura al dorso de tu tarjeta."),

            // Tarjeta denunciada: no ofrecer reintentar con la misma, y no
            // decirle al comprador por qué (si la robó, no le avisamos).
            4 or 7 or 43 => (PaywayDeclineCategory.CardReported, false,
                "El pago fue rechazado. Probá con otra tarjeta."),

            56 or 57 => (PaywayDeclineCategory.NotAllowed, false,
                "Tu tarjeta no está habilitada para este tipo de compra. Consultá con tu banco."),

            45 or 48 or 77 => (PaywayDeclineCategory.InstallmentsNotAllowed, true,
                "Esta tarjeta no permite esa cantidad de cuotas. Elegí un plan más corto."),

            // Configuración del comercio: el comprador no puede hacer nada.
            3 or 13 => (PaywayDeclineCategory.ConfigurationError, false,
                "No pudimos procesar el pago. Probá con otro medio de pago o escribinos."),

            8 => (PaywayDeclineCategory.Duplicate, false,
                "Parece que este pago ya fue procesado. Revisá tus pedidos antes de volver a intentar."),

            -1 or 12 or 28 or 96 or 97 or 10001 or 10003 or 10005 => (PaywayDeclineCategory.ProcessingError, true,
                "Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos."),

            _ => (PaywayDeclineCategory.GenericDecline, true,
                "Tu banco rechazó el pago. Probá con otra tarjeta o consultá con tu banco."),
        };

        return new PaywayDecline(category, code, description ?? "", retryable, message);
    }

    /// <summary>
    /// ¿El 400 es por reusar un token ya consumido?
    ///
    /// El token de Payway vale una sola vez y dura quince minutos; reenviarlo
    /// devuelve <c>{"validation_errors":[{"code":"repeated","param":"token"}]}</c>.
    /// Distinguirlo del resto de los 400 importa: casi siempre es el comprador
    /// reenviando el formulario, y merece que se le diga eso y no "datos
    /// inválidos".
    /// </summary>
    public static bool IsRepeatedToken(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("validation_errors", out var errors)
                || errors.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            return errors.EnumerateArray().Any(e =>
                JsonRead.GetString(e, "param") == "token"
                && JsonRead.GetString(e, "code") == "repeated");
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Marca de la tarjeta → <c>payment_method_id</c>.
    ///
    /// Hay dos tablas en circulación y Payway no confirmó cuál rige para un
    /// comercio nuevo: la clásica dice que Mastercard crédito es 15, y la que
    /// usan integraciones productivas dice 104. Se toma la clásica, que es la
    /// de la documentación histórica y la de los plugins oficiales, y el número
    /// queda guardado en cada intento para poder ver rápido si una marca
    /// empieza a rechazar en masa.
    /// </summary>
    public static int? PaymentMethodId(string? brand, bool isDebit) => (brand ?? "").Trim().ToLowerInvariant() switch
    {
        "visa" => isDebit ? 31 : 1,
        "mastercard" or "master" => isDebit ? 66 : 15,
        "maestro" => 99,
        "amex" or "american_express" => 65,
        "diners" or "diners_club" => 8,
        "cabal" => isDebit ? 67 : 27,
        "naranja" => 24,
        "argencard" => 30,
        "shopping" => 23,
        "nativa" => 42,
        _ => null,
    };

    /// <summary>
    /// Marca a partir del BIN. Payway no tiene consulta de BIN, así que los
    /// rangos se resuelven acá — son los de las propias marcas y no cambian.
    /// </summary>
    public static string? BrandFromBin(string? bin)
    {
        var digits = (bin ?? "").Trim();
        if (digits.Length < 6 || !digits.All(char.IsDigit)) return null;

        var two = int.Parse(digits[..2]);
        var four = int.Parse(digits[..4]);

        if (digits[0] == '4') return "visa";
        if (two is >= 51 and <= 55 || four is >= 2221 and <= 2720) return "mastercard";
        if (two is 34 or 37) return "amex";
        if (two is 36 or 38 or 30) return "diners";
        if (four is 5896) return "cabal";
        if (four is 5895) return "naranja";
        return null;
    }
}
