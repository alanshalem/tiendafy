using Checkout.Core.Domain;

namespace Checkout.Infrastructure.Carriers;

/// <summary>
/// Paquete agregado a cotizar: valores enteros en gramos/cm, como exige MiCorreo.
/// </summary>
public sealed record CorreoPackage(int WeightGrams, int LengthCm, int WidthCm, int HeightCm)
{
    /// <summary>
    /// Agrega N unidades con las dimensiones default de la tienda en un solo
    /// bulto, con la misma heurística del ecosistema MiCorreo: los ítems se
    /// apilan en vertical (alto × cantidad) y el peso se suma. Devuelve null
    /// si el paquete resultante supera los límites de MiCorreo (25 kg / 150 cm)
    /// — en ese caso el envío no se puede cotizar online.
    /// </summary>
    public static CorreoPackage? Aggregate(int units, int unitWeightGrams, int lengthCm, int widthCm, int heightCm) =>
        units < 1 ? null : Aggregate(Enumerable.Repeat(new ParcelUnit(unitWeightGrams, lengthCm, widthCm, heightCm), units).ToList());

    /// <summary>
    /// Igual, con un paquete distinto por unidad (peso y medidas de cada
    /// variante): el peso se suma, las alturas se apilan y el largo y el ancho
    /// son los del más grande.
    /// </summary>
    public static CorreoPackage? Aggregate(IReadOnlyList<ParcelUnit> units)
    {
        if (units.Count == 0) return null;
        var weight = units.Sum(u => (long)u.WeightGrams);
        var height = units.Sum(u => (long)u.HeightCm);
        var length = units.Max(u => u.LengthCm);
        var width = units.Max(u => u.WidthCm);
        if (weight > CorreoArgentinoConfig.MaxWeightGrams) return null;
        if (height > CorreoArgentinoConfig.MaxSideCm) return null;
        if (length > CorreoArgentinoConfig.MaxSideCm || width > CorreoArgentinoConfig.MaxSideCm) return null;
        return new CorreoPackage(
            Math.Max(1, (int)weight),
            Math.Max(1, length),
            Math.Max(1, width),
            Math.Max(1, (int)height));
    }
}
