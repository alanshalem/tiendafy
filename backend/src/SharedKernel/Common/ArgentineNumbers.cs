using System.Globalization;

namespace SharedKernel.Common;

/// <summary>
/// Números como se leen en Argentina: punto de miles y coma decimal ("1.500,50").
/// Explícito a propósito: el contenedor de producción corre con la cultura
/// invariante (sin LANG), así que un <c>{x:N0}</c> sin cultura salía "1,500" en
/// producción y "1.500" en una máquina de desarrollo en es-AR. Tampoco depende
/// de que la imagen traiga ICU: el formato se arma acá.
/// </summary>
public static class ArgentineNumbers
{
    public static readonly NumberFormatInfo Format = NumberFormatInfo.ReadOnly(new NumberFormatInfo
    {
        NumberGroupSeparator = ".",
        NumberDecimalSeparator = ",",
        CurrencyGroupSeparator = ".",
        CurrencyDecimalSeparator = ",",
        PercentGroupSeparator = ".",
        PercentDecimalSeparator = ",",
        NegativeSign = "-",
    });

    /// <summary>Con separador de miles y la cantidad de decimales pedida: 1500 → "1.500".</summary>
    public static string Number(decimal value, int decimals = 0) =>
        value.ToString("N" + decimals.ToString(CultureInfo.InvariantCulture), Format);

    /// <summary>"ARS 1.500" (pesos enteros, como se muestran en mails y etiquetas).</summary>
    public static string Money(Money money) => $"{money.Currency} {Number(money.ToDecimal())}";
}
