namespace Catalog.Core.Domain;

/// <summary>
/// Redondeo comercial de precios (centavos), para la repreciación masiva.
/// Función pura y con nombre propio: los modos válidos viven acá y no
/// duplicados en el endpoint, y así el borde de cada modo es testeable.
/// </summary>
public static class PriceRounding
{
    public const string None = "none";
    public const string Hundred = "100";
    public const string Thousand = "1000";
    /// <summary>Terminación $990 (el clásico "$45.990").</summary>
    public const string NineNinety = "990";

    public static bool IsValid(string? mode) =>
        mode is None or Hundred or Thousand or NineNinety;

    /// <summary>
    /// Redondea un precio en centavos. Cada modo tiene un piso para que un
    /// producto barato no quede en cero (con "990", el piso ES $990: un
    /// producto de $500 sube — el redondeo comercial no baja de su terminación).
    /// </summary>
    public static long Apply(long minor, string mode) => mode switch
    {
        Hundred => Math.Max(100_00, (long)Math.Round(minor / 100_00m) * 100_00),
        Thousand => Math.Max(1000_00, (long)Math.Round(minor / 1000_00m) * 1000_00),
        NineNinety => Math.Max(990_00, (long)Math.Round(minor / 1000_00m) * 1000_00 - 10_00),
        _ => minor,
    };
}
