namespace Api.Fiscal;

/// <summary>
/// CSV de los libros de IVA, en el formato que el Excel argentino abre sin
/// pelear: separador ";" (acá la coma es el decimal), números con coma decimal
/// y BOM al principio para que no se coman los acentos.
///
/// Vive en un solo lugar porque son dos libros —ventas y compras— y el que se
/// escriba distinto es el que el contador va a tener que arreglar a mano.
/// </summary>
public static class VatBookCsv
{
    private static readonly System.Globalization.CultureInfo Ar =
        System.Globalization.CultureInfo.GetCultureInfo("es-AR");

    /// <summary>Un importe como lo espera la planilla: dos decimales con coma.</summary>
    public static string Amount(decimal value) => value.ToString("0.00", Ar);

    public static string Date(DateTime value) => value.ToString("dd/MM/yyyy");

    /// <summary>Arma el archivo listo para descargar.</summary>
    public static byte[] Build(string header, IEnumerable<IEnumerable<string>> rows)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine(header);
        foreach (var row in rows)
            sb.AppendLine(string.Join(';', row.Select(Escape)));

        return [.. System.Text.Encoding.UTF8.GetPreamble(), .. System.Text.Encoding.UTF8.GetBytes(sb.ToString())];
    }

    /// <summary>Un nombre de proveedor con ";" adentro rompería las columnas.</summary>
    private static string Escape(string? value)
    {
        var v = value ?? string.Empty;
        return v.Contains(';') || v.Contains('"')
            ? $"\"{v.Replace("\"", "\"\"")}\""
            : v;
    }
}
