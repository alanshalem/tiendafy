namespace Fiscal.Core.Domain;

/// <summary>
/// Decide el receptor del comprobante a partir del documento del comprador: qué
/// tipo de documento es y cuál es su condición frente al IVA. Si el monto exige
/// identificar al comprador (umbral de consumidor final, H12) lo decide quien
/// emite, que tiene el monto y la configuración; acá solo se clasifica.
///
/// <para>
/// <b>La condición frente al IVA no se adivina.</b> Antes cualquier número de
/// once dígitos con verificador válido salía Responsable Inscripto, y eso es
/// Factura A. Pero un CUIL tiene exactamente la misma forma que un CUIT, y un
/// monotributista también: el comprador escribía su CUIL y se le emitía una A
/// con IVA discriminado que no le corresponde. Emitir A de más es un
/// comprobante mal emitido; emitir B de más es un crédito fiscal que el
/// comprador no puede computar y se arregla con una nota de crédito. Entre los
/// dos errores, el segundo es el barato.
/// </para>
///
/// <para>
/// Lo único que se infiere es lo que el número realmente dice: el prefijo
/// distingue persona jurídica de persona física. Una sociedad es Responsable
/// Inscripto salvo rareza; una persona física puede ser cualquier cosa, así
/// que se la trata como consumidor final mientras nadie diga lo contrario.
/// Para saberlo de verdad hay que preguntarle al padrón de ARCA (la
/// constancia de inscripción, <c>ITaxpayerRegistry</c>): el panel lo consulta
/// y quien conoce la condición la pasa en <paramref name="declared"/>.
/// </para>
/// </summary>
public static class ReceptorResolver
{
    /// <summary>
    /// Prefijos de CUIT de persona jurídica (sociedades, asociaciones, el
    /// Estado). Todo lo demás con forma de CUIT es una persona física, y de
    /// esas el número no dice nada sobre el IVA.
    /// </summary>
    private static readonly string[] PersonaJuridica = ["30", "33", "34"];

    /// <param name="buyerDoc">DNI/CUIT que dejó el comprador (o null).</param>
    /// <param name="declared">
    /// Condición frente al IVA cuando se la conoce de verdad —la cargó el
    /// comercio, la declaró el comprador, la devolvió el padrón—. Gana sobre
    /// cualquier inferencia: el número nunca va a saber más que el dato.
    /// </param>
    public static Receptor Resolve(string? buyerDoc, CondicionIvaReceptor? declared = null)
    {
        var digits = new string([.. (buyerDoc ?? string.Empty).Where(char.IsDigit)]);

        // Once dígitos con verificador válido: es un CUIT/CUIL bien formado.
        if (digits.Length == 11 && Cuit.Create(digits).IsSuccess)
            return new Receptor(DocTipo.Cuit, long.Parse(digits), declared ?? InferirCondicion(digits));

        // DNI (7-8 dígitos) → consumidor identificado.
        if (digits.Length is 7 or 8)
            return new Receptor(DocTipo.Dni, long.Parse(digits), declared ?? CondicionIvaReceptor.ConsumidorFinal);

        // Sin documento usable: Consumidor Final anónimo. Si el monto lo
        // permite lo decide quien emite (ver EmitInvoiceHandler).
        return new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal);
    }

    /// <summary>Lo único que el número permite deducir, y nada más que eso.</summary>
    private static CondicionIvaReceptor InferirCondicion(string cuit) =>
        PersonaJuridica.Contains(cuit[..2])
            ? CondicionIvaReceptor.ResponsableInscripto
            : CondicionIvaReceptor.ConsumidorFinal;
}
