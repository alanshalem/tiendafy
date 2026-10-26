namespace Api.Ai.Catalog;

/// <summary>
/// GTIN/EAN/UPC: 8, 12, 13 o 14 dígitos y el último es un dígito verificador (módulo 10). Es lo que
/// más fácil inventa un modelo y lo que más daño hace en Mercado Libre, así que se valida con código.
/// </summary>
public static class Gtin
{
    private static readonly int[] ValidLengths = [8, 12, 13, 14];

    /// <summary>Saca los espacios y los guiones con los que la gente escribe un código ("400 6381-333931").</summary>
    public static string Normalize(string raw) =>
        string.Concat(raw.Where(c => !char.IsWhiteSpace(c) && c != '-'));

    public static bool IsValid(string? value)
    {
        if (string.IsNullOrEmpty(value) || !ValidLengths.Contains(value.Length) || !value.All(char.IsAsciiDigit))
            return false;

        // Desde el dígito de al lado del verificador hacia la izquierda: pesos 3, 1, 3, 1…
        var sum = 0;
        for (var i = value.Length - 2; i >= 0; i--)
        {
            var digit = value[i] - '0';
            sum += (value.Length - 2 - i) % 2 == 0 ? digit * 3 : digit;
        }
        return (10 - sum % 10) % 10 == value[^1] - '0';
    }
}
