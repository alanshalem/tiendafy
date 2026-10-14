namespace Api.Fiscal;

/// <summary>
/// CSV de los libros de IVA, en el formato que el Excel argentino abre sin
/// pelear: separador ";" (acá la coma es el decimal), números con coma decimal
/// y BOM al principio para que no se coman los acentos.
///
/// Vive en un solo lugar porque son dos libros —ventas y compras— y el que se
/// escriba distinto es el que el contador va a tener que arreglar a mano. Los
/// listados que se exportan del panel (ventas, clientes) usan el mismo formato
/// por la misma razón: los abre la misma persona, con el mismo Excel.
/// </summary>
public static class VatBookCsv
{
    private static readonly System.Globalization.CultureInfo Ar =
        System.Globalization.CultureInfo.GetCultureInfo("es-AR");

    /// <summary>Un importe como lo espera la planilla: dos decimales con coma.</summary>
    public static string Amount(decimal value) => value.ToString("0.00", Ar);

    public static string Date(DateTime value) => value.ToString("dd/MM/yyyy");

    /// <summary>
    /// Un texto que escribió alguien de afuera (el nombre que puso un comprador
    /// en el checkout, una nota). Si empieza con "=", "+", "-" o "@", Excel lo
    /// toma como fórmula al abrir el archivo: un nombre armado a propósito
    /// ejecutaría algo en la computadora de quien exporta. El apóstrofo
    /// adelante lo deja como texto. No va en los importes, que sí son números.
    /// </summary>
    public static string Text(string? value) =>
        value is { Length: > 0 } v && v[0] is '=' or '+' or '-' or '@' or '\t' or '\r' ? $"'{v}" : value ?? string.Empty;

    /// <summary>Arma el archivo listo para descargar.</summary>
    public static byte[] Build(string header, IEnumerable<IEnumerable<string>> rows)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine(header);
        foreach (var row in rows)
            sb.AppendLine(Line(row));

        return [.. System.Text.Encoding.UTF8.GetPreamble(), .. System.Text.Encoding.UTF8.GetBytes(sb.ToString())];
    }

    /// <summary>
    /// El archivo como respuesta que se escribe a medida que llegan las filas
    /// de la base: un listado de miles de ventas no se junta entero en memoria
    /// antes de empezar a mandarlo.
    /// </summary>
    public static IResult Download(
        string fileName, string header, IAsyncEnumerable<IEnumerable<string?>> rows, CancellationToken ct) =>
        Results.Stream(async body =>
        {
            // El BOM a mano: si lo decide el StreamWriter, depende de si el
            // stream de la respuesta "parece" estar al principio.
            await body.WriteAsync(System.Text.Encoding.UTF8.GetPreamble());
            await using var writer = new StreamWriter(body, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            await writer.WriteLineAsync(header);
            await foreach (var row in rows.WithCancellation(ct))
                await writer.WriteLineAsync(Line(row));
            await writer.FlushAsync();
        }, "text/csv; charset=utf-8", fileName);

    /// <summary>
    /// Una fila ya escapada. Pública para quien escribe el archivo de a poco
    /// (el export de ventas va al response fila por fila, sin juntarlo entero
    /// en memoria) y tiene que salir igual que lo que arma <see cref="Build"/>.
    /// </summary>
    public static string Line(IEnumerable<string?> row) => string.Join(';', row.Select(Escape));

    /// <summary>
    /// Un nombre de proveedor con ";" adentro rompería las columnas; una nota
    /// o una dirección con un salto de línea, las filas.
    /// </summary>
    private static string Escape(string? value)
    {
        var v = value ?? string.Empty;
        return v.Contains(';') || v.Contains('"') || v.Contains('\n') || v.Contains('\r')
            ? $"\"{v.Replace("\"", "\"\"")}\""
            : v;
    }
}
