using Fiscal.Core.Domain;

namespace Api.Fiscal;

/// <summary>
/// La condición frente al IVA como viaja por la API: el nombre del enum
/// ("ResponsableInscripto", "Monotributo", "Exento", "ConsumidorFinal"). La
/// usan el padrón (para devolverla) y la facturación de una venta (para
/// recibirla), y tienen que hablar el mismo idioma.
/// </summary>
internal static class IvaConditionWire
{
    public static string Write(CondicionIvaReceptor condicion) => condicion.ToString();

    /// <summary>Null si no vino o no es una condición conocida: se infiere del documento.</summary>
    public static CondicionIvaReceptor? Read(string? value) =>
        Enum.TryParse<CondicionIvaReceptor>(value?.Trim(), ignoreCase: true, out var c) && Enum.IsDefined(c) ? c : null;
}
