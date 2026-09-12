using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Qué precio tiene una variante en una lista.
///
/// Pura y sin base de datos: recibe las listas y los precios escritos a mano ya
/// cargados, y responde. Así el recorrido de una lista sobre otra —el único
/// lugar donde esto se puede enredar— se prueba sin levantar nada.
///
/// El orden es el que espera quien lo carga:
///   1. Si hay un precio escrito a mano para esa variante en esa lista, ese.
///   2. Si no, se resuelve el precio de la lista base (recursivo) y se le
///      aplica el porcentaje y el redondeo de esta lista.
///   3. La lista base de todo es el precio del producto.
///
/// Una cadena rota —una lista que apunta a otra borrada, o dos que se apuntan
/// entre sí— cae al precio del producto en vez de tirar todo abajo: un precio
/// de más es un problema de carga, un catálogo caído es un problema de todos.
/// </summary>
public sealed class PriceResolver
{
    private readonly Dictionary<Guid, PriceList> _lists;
    private readonly Dictionary<(Guid ListId, Guid VariantId), long> _overrides;

    public PriceResolver(IEnumerable<PriceList> lists, IEnumerable<PriceListItem> overrides)
    {
        _lists = lists.ToDictionary(l => l.Id);
        _overrides = overrides
            .GroupBy(i => (i.PriceListId, i.VariantId))
            .ToDictionary(g => g.Key, g => g.First().PriceMinor);
    }

    /// <summary>
    /// El precio final. <paramref name="priceListId"/> null —o una lista que no
    /// existe— devuelve el precio del producto sin tocar.
    /// </summary>
    public long Resolve(Guid? priceListId, Guid variantId, long basePriceMinor) =>
        Resolve(priceListId, variantId, basePriceMinor, PriceList.MaxChainDepth, []);

    /// <summary>
    /// Igual que <see cref="Resolve"/> pero además dice de dónde salió el
    /// número. La pantalla de listas lo usa para marcar qué precios están
    /// escritos a mano: sin eso, un precio editado y uno calculado se ven igual
    /// y nadie sabe cuál va a cambiar solo la próxima repreciación.
    /// </summary>
    public PricedVariant Explain(Guid? priceListId, Guid variantId, long basePriceMinor)
    {
        var manual = priceListId is { } id && _overrides.ContainsKey((id, variantId));
        return new PricedVariant(Resolve(priceListId, variantId, basePriceMinor), manual);
    }

    private long Resolve(Guid? priceListId, Guid variantId, long basePriceMinor, int depth, HashSet<Guid> seen)
    {
        if (priceListId is not { } id || depth <= 0) return basePriceMinor;
        if (!_lists.TryGetValue(id, out var list)) return basePriceMinor;

        // Una lista que ya se visitó en esta cadena es un ciclo: cortar acá deja
        // el precio del producto, que es un número honesto.
        if (!seen.Add(id)) return basePriceMinor;

        if (_overrides.TryGetValue((id, variantId), out var manual)) return manual;

        var from = Resolve(list.BasedOnPriceListId, variantId, basePriceMinor, depth - 1, seen);
        return list.Apply(from);
    }

    /// <summary>
    /// ¿Se puede hacer que <paramref name="listId"/> se calcule sobre
    /// <paramref name="basedOnId"/>? Se pregunta ANTES de guardar: un ciclo
    /// guardado se resuelve solo en silencio y deja precios que nadie explica.
    /// </summary>
    public Result CanBaseOn(Guid listId, Guid? basedOnId)
    {
        if (basedOnId is not { } target) return Result.Success();
        if (target == listId)
            return Result.Failure(Error.Validation(
                "PriceList.SelfReference", "Una lista no se puede calcular sobre sí misma."));

        var seen = new HashSet<Guid> { listId };
        var current = target;
        for (var step = 0; step < PriceList.MaxChainDepth; step++)
        {
            if (!seen.Add(current))
                return Result.Failure(Error.Validation(
                    "PriceList.Cycle", "Esa combinación deja dos listas calculándose una sobre la otra."));

            if (!_lists.TryGetValue(current, out var list) || list.BasedOnPriceListId is not { } next)
                return Result.Success();

            current = next;
        }

        return Result.Failure(Error.Validation(
            "PriceList.ChainTooLong", $"No se pueden encadenar más de {PriceList.MaxChainDepth} listas."));
    }
}

/// <summary>Un precio resuelto y si vino de la regla o de una edición a mano.</summary>
public readonly record struct PricedVariant(long PriceMinor, bool IsManual);
