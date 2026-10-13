using Catalog.Contracts;
using Checkout.Core.Domain;

namespace Api.Shipping;

/// <summary>Una línea del carrito tal como la manda el checkout para cotizar.</summary>
public sealed record CartLineInput(Guid VariantId, int Quantity);

/// <summary>
/// Los paquetes a cotizar o despachar: uno por unidad, con el peso y las
/// medidas de su variante. <see cref="CartKey"/> ata la cotización al
/// contenido del carrito (null si se cotizó a la vieja usanza, solo por
/// cantidad de unidades).
/// </summary>
public sealed record CartParcels(IReadOnlyList<ParcelUnit> Units, string? CartKey)
{
    public int Count => Units.Count;
    public int TotalWeightGrams => Units.Sum(u => u.WeightGrams);
}

public static class CartParcelsBuilder
{
    /// <summary>
    /// Los paquetes de esas líneas. Lo que la variante no tiene cargado sale
    /// del default del correo; una variante que no existe (carrito viejo, otra
    /// tienda) también, y el checkout la rechaza después al validar la sesión.
    /// Null si son más unidades que <paramref name="maxUnits"/>.
    /// </summary>
    public static async Task<CartParcels?> FromLinesAsync(
        ICatalogCheckoutQuery catalog, Guid tenantId, IEnumerable<(Guid VariantId, int Quantity)> lines,
        ParcelUnit fallback, int maxUnits, CancellationToken ct)
    {
        var merged = lines
            .Where(l => l.Quantity > 0)
            .GroupBy(l => l.VariantId)
            .Select(g => (VariantId: g.Key, Quantity: g.Sum(l => l.Quantity)))
            .ToList();
        if (merged.Sum(l => (long)l.Quantity) > maxUnits) return null;

        var variants = (await catalog.GetVariantsAsync(tenantId, merged.Select(l => l.VariantId).ToList(), ct))
            .ToDictionary(v => v.VariantId);
        var units = new List<ParcelUnit>();
        foreach (var (variantId, quantity) in merged)
        {
            var unit = variants.TryGetValue(variantId, out var v)
                ? ParcelUnit.For(v.WeightGrams, v.LengthCm, v.WidthCm, v.HeightCm, fallback)
                : fallback;
            units.AddRange(Enumerable.Repeat(unit, quantity));
        }
        return new CartParcels(units, CartKey.Of(merged));
    }

    /// <summary>
    /// Lo que cotiza el checkout: con el detalle del carrito si lo mandó; si no
    /// (un storefront viejo), N unidades del paquete por defecto.
    /// </summary>
    public static Task<CartParcels?> FromQuoteAsync(
        ICatalogCheckoutQuery catalog, Guid tenantId, IReadOnlyList<CartLineInput>? items, int? units,
        ParcelUnit fallback, int maxUnits, CancellationToken ct)
    {
        if (items is { Count: > 0 })
            return FromLinesAsync(catalog, tenantId, items.Select(i => (i.VariantId, i.Quantity)), fallback, maxUnits, ct);

        var count = units ?? 0;
        return Task.FromResult<CartParcels?>(count > maxUnits
            ? null
            : new CartParcels(Enumerable.Repeat(fallback, Math.Max(0, count)).ToList(), null));
    }
}
