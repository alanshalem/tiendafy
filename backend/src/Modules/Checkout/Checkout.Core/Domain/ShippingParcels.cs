using System.Security.Cryptography;
using System.Text;

namespace Checkout.Core.Domain;

/// <summary>
/// El paquete de UNA unidad a despachar: gramos y centímetros enteros, que es
/// lo que piden los tres correos.
/// </summary>
public sealed record ParcelUnit(int WeightGrams, int LengthCm, int WidthCm, int HeightCm)
{
    public int VolumeCm3 => LengthCm * WidthCm * HeightCm;

    /// <summary>
    /// El paquete de una unidad de esa variante: lo que tenga cargado y, lo que
    /// no, el default del correo. Las medidas van juntas: mezclar el largo de
    /// la variante con el ancho del default daría una caja que no existe.
    /// </summary>
    public static ParcelUnit For(int? weightGrams, int? lengthCm, int? widthCm, int? heightCm, ParcelUnit fallback) =>
        lengthCm is { } l && widthCm is { } w && heightCm is { } h
            ? new ParcelUnit(weightGrams ?? fallback.WeightGrams, l, w, h)
            : fallback with { WeightGrams = weightGrams ?? fallback.WeightGrams };
}

/// <summary>
/// Huella del contenido de un carrito: qué variantes y cuántas de cada una.
///
/// La cotización de envío queda atada a esta huella y no solo a la cantidad
/// de unidades: con peso por variante, cambiar tres medias por tres discos de
/// 15 kg cambia el envío aunque sigan siendo tres unidades.
/// </summary>
public static class CartKey
{
    public static string Of(IEnumerable<(Guid VariantId, int Quantity)> lines)
    {
        var canonical = string.Join('|', lines
            .GroupBy(l => l.VariantId)
            .Select(g => (Id: g.Key, Quantity: g.Sum(l => l.Quantity)))
            .Where(l => l.Quantity > 0)
            .OrderBy(l => l.Id)
            .Select(l => $"{l.Id:N}:{l.Quantity}"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)))[..32];
    }
}
