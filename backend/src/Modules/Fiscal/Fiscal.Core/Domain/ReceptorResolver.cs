namespace Fiscal.Core.Domain;

/// <summary>
/// Decide el receptor del comprobante a partir del documento del comprador y el
/// umbral de consumidor final (H12): por debajo del umbral se puede facturar a
/// Consumidor Final (DocTipo=99, DocNro=0); por encima hay que identificarlo.
/// Un CUIT identifica a un Responsable Inscripto; un DNI, a un consumidor.
/// </summary>
public static class ReceptorResolver
{
    /// <param name="buyerDoc">DNI/CUIT que dejó el comprador (o null).</param>
    /// <param name="grossMinorUnits">Total a facturar, en centavos.</param>
    /// <param name="thresholdMinorUnits">Umbral de consumidor final (configurable).</param>
    public static Receptor Resolve(string? buyerDoc, long grossMinorUnits, long thresholdMinorUnits)
    {
        var digits = new string([.. (buyerDoc ?? string.Empty).Where(char.IsDigit)]);

        // 11 dígitos con dígito verificador válido → CUIT → Responsable Inscripto.
        if (digits.Length == 11 && Cuit.Create(digits).IsSuccess)
            return new Receptor(DocTipo.Cuit, long.Parse(digits), CondicionIvaReceptor.ResponsableInscripto);

        // DNI (7-8 dígitos) → consumidor identificado.
        if (digits.Length is 7 or 8)
            return new Receptor(DocTipo.Dni, long.Parse(digits), CondicionIvaReceptor.ConsumidorFinal);

        // Sin documento usable: por debajo del umbral, Consumidor Final anónimo.
        // (Por encima del umbral ARCA exige identificación; el caller debería
        // haber pedido el doc — igual emitimos como CF y ARCA decide.)
        return new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal);
    }
}
