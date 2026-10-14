using System.Linq.Expressions;
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
///
/// <para>
/// Con sinónimos (solo la tienda: el panel busca lo que el comercio cargó, con
/// sus palabras), cada palabra vale también por cualquiera de su grupo:
/// "mancuerna" encuentra "DUMBBELLS HEXAGONALES". Ver <see cref="SearchSynonyms"/>.
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
    public static IQueryable<Product> Matching(
        IQueryable<Product> query, string? text, bool includeSku,
        IReadOnlyList<IReadOnlyList<string>>? synonyms = null)
    {
        foreach (var alternatives in SearchSynonyms.Expand(text, synonyms))
        {
            var predicate = AnyOf(alternatives, NameLike<Product>(p => p.Name));
            if (includeSku)
                predicate = Or(predicate, AnyOf(alternatives, SkuLike));
            query = query.Where(predicate);
        }

        return query;
    }

    /// <summary>
    /// Lo mismo para cualquier cosa con nombre (las categorías del buscador
    /// predictivo): cada palabra, o alguno de sus sinónimos, en el nombre.
    /// </summary>
    public static IQueryable<T> MatchingName<T>(
        IQueryable<T> query, Expression<Func<T, string>> name, string? text,
        IReadOnlyList<IReadOnlyList<string>>? synonyms = null)
    {
        foreach (var alternatives in SearchSynonyms.Expand(text, synonyms))
            query = query.Where(AnyOf(alternatives, NameLike(name)));
        return query;
    }

    /// <summary>Las palabras del texto, sin vacías. Sin texto, ninguna: no filtra.</summary>
    internal static IEnumerable<string> Words(string? text) =>
        (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    // Cada alternativa arma su predicado con el patrón capturado en una
    // variable: así EF lo manda como parámetro y no como literal en el SQL
    // (un plan por búsqueda distinta en la caché de Postgres).
    private static Func<string, Expression<Func<T, bool>>> NameLike<T>(Expression<Func<T, string>> name) =>
        word =>
        {
            var pattern = $"%{word}%";
            Expression<Func<string, bool>> like = n =>
                EF.Functions.ILike(EF.Functions.Unaccent(n), EF.Functions.Unaccent(pattern));
            var param = name.Parameters[0];
            var body = new Replace(like.Parameters[0], name.Body).Visit(like.Body)!;
            return Expression.Lambda<Func<T, bool>>(body, param);
        };

    private static Expression<Func<Product, bool>> SkuLike(string word)
    {
        var pattern = $"%{word}%";
        return p => p.Variants.Any(v => EF.Functions.ILike(v.Sku, pattern));
    }

    /// <summary>
    /// Alguna de las alternativas. Una alternativa de varias palabras ("pesa
    /// rusa") pide cada una por separado y no la frase pegada: así también
    /// encuentra "PESAS RUSAS" y "Rusa, pesa de hierro".
    /// </summary>
    private static Expression<Func<T, bool>> AnyOf<T>(
        IReadOnlyList<string> alternatives, Func<string, Expression<Func<T, bool>>> build) =>
        alternatives
            .Select(alternative => Words(alternative).Select(build).Aggregate(And))
            .Aggregate(Or);

    private static Expression<Func<T, bool>> Or<T>(Expression<Func<T, bool>> left, Expression<Func<T, bool>> right) =>
        Combine(left, right, Expression.OrElse);

    private static Expression<Func<T, bool>> And<T>(Expression<Func<T, bool>> left, Expression<Func<T, bool>> right) =>
        Combine(left, right, Expression.AndAlso);

    private static Expression<Func<T, bool>> Combine<T>(
        Expression<Func<T, bool>> left, Expression<Func<T, bool>> right,
        Func<Expression, Expression, BinaryExpression> join)
    {
        var param = left.Parameters[0];
        var rightBody = new Replace(right.Parameters[0], param).Visit(right.Body)!;
        return Expression.Lambda<Func<T, bool>>(join(left.Body, rightBody), param);
    }

    /// <summary>Cambia una expresión por otra adentro de un árbol (para pegar dos lambdas en una).</summary>
    private sealed class Replace(Expression from, Expression to) : ExpressionVisitor
    {
        public override Expression? Visit(Expression? node) => node == from ? to : base.Visit(node);
    }
}
