using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// La mecánica de un listado paginado: contar el total y traer una página, con
/// el offset y el límite saneados.
///
/// <para>
/// Estaba copiada en una docena de listados —las mismas cuatro líneas con el
/// <c>Math.Max</c>, el <c>Math.Clamp</c>, el conteo y el Skip/Take—, y en cada
/// copia el tope de página era un número suelto que nadie podía comparar con
/// los demás. Un listado al que se le olvida el clamp acepta
/// <c>?limit=100000</c> y se trae la tabla entera a memoria.
/// </para>
///
/// <para>
/// La forma de la respuesta la sigue armando cada endpoint: unificarlas sería
/// cambiarle el contrato al panel, y eso es otra conversación. Esto es solo la
/// mecánica.
/// </para>
/// </summary>
public static class Paging
{
    /// <summary>Tamaño de página cuando el cliente no pide uno.</summary>
    public const int DefaultLimit = 50;

    /// <summary>Techo duro: lo máximo que un listado devuelve por página.</summary>
    public const int MaxLimit = 200;

    /// <summary>
    /// Qué ventana de filas corresponde a lo que pidió el cliente, saneada: un
    /// offset negativo es el principio, y el límite nunca se va del rango —ni
    /// cero (una página vacía para siempre) ni la tabla entera—.
    /// </summary>
    public static (int Skip, int Take) Window(
        int? offset, int? limit, int defaultLimit = DefaultLimit, int maxLimit = MaxLimit) =>
        (Math.Max(0, offset ?? 0), Math.Clamp(limit ?? defaultLimit, 1, maxLimit));

    /// <summary>
    /// Total de la consulta + la página pedida. La consulta tiene que venir ya
    /// ordenada: sin orden, "la página 2" no quiere decir nada.
    /// </summary>
    public static async Task<(List<T> Items, int Total)> PageAsync<T>(
        this IQueryable<T> query,
        int? offset,
        int? limit,
        CancellationToken ct,
        int defaultLimit = DefaultLimit,
        int maxLimit = MaxLimit)
    {
        var total = await query.CountAsync(ct);
        var (skip, take) = Window(offset, limit, defaultLimit, maxLimit);
        var items = await query.Skip(skip).Take(take).ToListAsync(ct);

        return (items, total);
    }
}
