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
    public static CorreoPackage? Aggregate(int units, int unitWeightGrams, int lengthCm, int widthCm, int heightCm)
    {
        if (units < 1) return null;
        var weight = unitWeightGrams * units;
        var height = heightCm * units;
        if (weight > CorreoArgentinoConfig.MaxWeightGrams) return null;
        if (height > CorreoArgentinoConfig.MaxSideCm) return null;
        if (lengthCm > CorreoArgentinoConfig.MaxSideCm || widthCm > CorreoArgentinoConfig.MaxSideCm) return null;
        return new CorreoPackage(
            Math.Max(1, weight),
            Math.Max(1, lengthCm),
            Math.Max(1, widthCm),
            Math.Max(1, height));
    }
}
