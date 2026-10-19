using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Api.Shipping;

/// <summary>
/// El código postal con el que se cotizó un envío contra el de la dirección
/// a la que se manda. El precio de un correo depende del destino: sin esta
/// comparación, alguien cotizaba a un CP barato y confirmaba la compra con
/// otro.
///
/// <para>
/// Se compara solo la parte numérica de 4 dígitos: el CPA <c>C1425ABC</c> y
/// <c>1425</c> son el mismo destino para los correos.
/// </para>
/// </summary>
public static partial class ShippingPostalCode
{
    /// <summary>"C1425ABC" → "1425", "1425" → "1425"; null si no hay 4 dígitos.</summary>
    public static string? Normalize(string? raw)
    {
        var digits = new string((raw ?? "").Where(char.IsAsciiDigit).ToArray());
        return digits.Length >= 4 ? digits[..4] : null;
    }

    /// <summary>
    /// El "CP 1425" de la dirección que arma la tienda. Es lo que mandaba antes
    /// de que existiera el campo aparte, y una dirección que dice otro CP que el
    /// campo también tiene que volver a cotizar.
    /// </summary>
    public static string? FromAddress(string? address)
    {
        if (string.IsNullOrWhiteSpace(address)) return null;
        var match = CpInAddress().Match(address);
        return match.Success ? Normalize(match.Groups[1].Value) : null;
    }

    /// <summary>
    /// Null si la dirección va al CP cotizado; si no, el error para el
    /// comprador. Se miran el campo del CP y el de la dirección: los dos
    /// tienen que coincidir con la cotización.
    /// </summary>
    public static Error? Check(string quotedPostalCode, string? postalCode, string? address)
    {
        var quoted = Normalize(quotedPostalCode);
        var given = new[] { Normalize(postalCode), FromAddress(address) }.OfType<string>().ToList();

        if (given.Count == 0)
            return Error.Validation("Checkout.MissingPostalCode",
                "Completá el código postal de la dirección de envío.");

        return quoted is not null && given.All(cp => cp == quoted)
            ? null
            : Error.Validation("Checkout.PostalCodeChanged",
                "Cambiaste el código postal: volvé a cotizar el envío para esa dirección.");
    }

    [GeneratedRegex(@"\bCP\s*:?\s*([A-Za-z]?\d{4}[A-Za-z]{0,3})\b", RegexOptions.IgnoreCase)]
    private static partial Regex CpInAddress();
}
