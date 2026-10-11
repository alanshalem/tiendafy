using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Catalog.Infrastructure.Persistence;

/// <summary>
/// Buscar productos por lo que una persona escribe.
///
/// <para>
/// Cada palabra tiene que aparecer, en cualquier orden y sin importar tildes
/// ni mayúsculas: "camion rojo" encuentra "Camión de juguete Rojo". Antes la
/// búsqueda era el texto entero, contiguo y sensible a tildes, así que
/// "camion" no encontraba "Camión" y "rojo camión" no encontraba nada. Es un
/// superconjunto estricto de lo anterior: si el texto entero aparecía, cada
/// una de sus palabras también aparece.
/// </para>
///
/// <para>
/// Lo usaban, cada uno con su copia del predicado, el listado del panel (y con
/// él todos los selectores de productos), las listas de precios y el buscador
/// de la tienda. Las tildes las saca <c>unaccent</c> de Postgres, del lado de
/// la base y a los dos lados de la comparación, así ambos usan el mismo
/// diccionario.
/// </para>
/// </summary>
public static class ProductTextSearch
{
    /// <summary>
    /// Filtra por cada palabra del texto. Con <paramref name="includeSku"/>, una
    /// palabra también vale si está en el SKU de alguna variante (el panel busca
    /// por código; la tienda no, para no mostrarle al comprador coincidencias
    /// que no entiende).
    /// </summary>
    public static IQueryable<Product> Matching(IQueryable<Product> query, string? text, bool includeSku)
    {
        foreach (var word in Words(text))
        {
            var pattern = $"%{word}%";
            query = includeSku
                ? query.Where(p =>
                    EF.Functions.ILike(EF.Functions.Unaccent(p.Name), EF.Functions.Unaccent(pattern))
                    || p.Variants.Any(v => EF.Functions.ILike(v.Sku, pattern)))
                : query.Where(p =>
                    EF.Functions.ILike(EF.Functions.Unaccent(p.Name), EF.Functions.Unaccent(pattern)));
        }

        return query;
    }

    /// <summary>Las palabras del texto, sin vacías. Sin texto, ninguna: no filtra.</summary>
    internal static IEnumerable<string> Words(string? text) =>
        (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
