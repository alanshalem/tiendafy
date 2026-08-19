namespace MercadoLibre.Infrastructure;

/// <summary>
/// Precio de una publicación de Mercado Libre a partir del precio de la tienda.
/// Función pura y con nombre propio porque la regla tiene plata adentro: ML
/// cobra una comisión bastante mayor que la tienda propia, así que publicar el
/// mismo número en los dos lados es vender en ML con la mitad del margen. El
/// recargo por conexión corrige eso, y el redondeo deja un precio que se puede
/// mostrar (ML acepta dos decimales).
/// </summary>
public static class MeliPricing
{
    /// <param name="localMinorUnits">Precio de la tienda, en centavos.</param>
    /// <param name="markupPct">Recargo del canal (0 = mismo precio; negativo = más barato).</param>
    /// <returns>Precio a publicar en ML, en centavos.</returns>
    public static long ForChannel(long localMinorUnits, decimal markupPct)
    {
        if (localMinorUnits <= 0) return 0;

        var factor = 1m + (markupPct / 100m);
        // AwayFromZero: el redondeo nunca deja el precio por debajo de lo que
        // el comerciante pidió (el criterio de PriceRounding del catálogo).
        var minor = Math.Round(localMinorUnits * factor, MidpointRounding.AwayFromZero);

        // ML no acepta precios en cero: si el recargo negativo se pasa de rosca,
        // el piso es un centavo (y el propio Clamp de la conexión evita el -100 %).
        return (long)Math.Max(1m, minor);
    }

    /// <summary>El precio en la unidad que viaja a la API de ML (pesos con centavos).</summary>
    public static decimal ToApiAmount(long minorUnits) => minorUnits / 100m;
}
