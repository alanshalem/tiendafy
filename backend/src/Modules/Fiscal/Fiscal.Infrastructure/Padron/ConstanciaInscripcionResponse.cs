using System.Xml.Linq;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Padron;

/// <summary>
/// Lee la respuesta de getPersona_v2 (constancia de inscripción) y la traduce
/// a lo que la facturación necesita: nombre y condición frente al IVA.
///
/// <para>
/// Se busca por nombre local y no por namespace, como en WSFEv1: ARCA cambia
/// prefijos entre versiones y ambientes, y los nombres son lo estable. Los
/// hijos de <c>personaReturn</c> vienen sin namespace.
/// </para>
///
/// <para>
/// La condición sale de qué datos tiene la persona: si figura en el régimen
/// simplificado es monotributista; si en el régimen general tiene el impuesto
/// IVA (30) es Responsable Inscripto, y si tiene IVA EXENTO (32), exento. Sin
/// ninguno de los dos es consumidor final. Pero si ARCA no manda los datos de
/// un régimen porque no puede emitir esa parte de la constancia
/// (<c>errorRegimenGeneral</c> / <c>errorMonotributo</c>), la ausencia no dice
/// nada: no se adivina consumidor final, se informa que no se sabe.
/// </para>
/// </summary>
internal static class ConstanciaInscripcionResponse
{
    /// <summary>Impuesto "IVA" en el padrón.</summary>
    public const int IdImpuestoIva = 30;

    /// <summary>Impuesto "IVA EXENTO" en el padrón.</summary>
    public const int IdImpuestoIvaExento = 32;

    public static Result<TaxpayerInfo> Parse(XElement root, long cuit)
    {
        var persona = Find(root, "personaReturn");
        var generales = persona is null ? null : Child(persona, "datosGenerales");

        if (generales is null)
        {
            // Sin datos generales, ARCA explica por qué en errorConstancia
            // (por ejemplo "No existe persona con ese Id").
            var motivo = persona is null ? null : Errors(persona, "errorConstancia").FirstOrDefault();
            return Result.Failure<TaxpayerInfo>(Error.Validation("Padron.NotFound",
                string.IsNullOrWhiteSpace(motivo)
                    ? $"ARCA no tiene una constancia de inscripción para el CUIT {cuit}."
                    : $"ARCA: {motivo}"));
        }

        var condicion = Condicion(persona!);
        if (condicion is null)
        {
            var motivo = Errors(persona!, "errorRegimenGeneral").Concat(Errors(persona!, "errorMonotributo")).FirstOrDefault();
            return Result.Failure<TaxpayerInfo>(Error.Validation("Padron.NoCondition",
                "ARCA no informa la condición frente al IVA de este CUIT"
                + (string.IsNullOrWhiteSpace(motivo) ? "" : $" ({motivo})")
                + ". Elegila a mano antes de facturar."));
        }

        var isCompany = string.Equals(Text(generales, "tipoPersona"), "JURIDICA", StringComparison.OrdinalIgnoreCase);
        var name = isCompany
            ? Text(generales, "razonSocial")
            : string.Join(", ", new[] { Text(generales, "apellido"), Text(generales, "nombre") }
                .Where(s => !string.IsNullOrWhiteSpace(s)));

        return new TaxpayerInfo(
            cuit,
            string.IsNullOrWhiteSpace(name) ? cuit.ToString() : name!,
            isCompany,
            condicion.Value,
            Address(generales));
    }

    /// <summary>La condición frente al IVA, o null si ARCA no mandó con qué deducirla.</summary>
    private static CondicionIvaReceptor? Condicion(XElement persona)
    {
        if (Child(persona, "datosMonotributo") is not null)
            return CondicionIvaReceptor.Monotributo;

        var regimenGeneral = Child(persona, "datosRegimenGeneral");
        if (regimenGeneral is null
            && (Child(persona, "errorRegimenGeneral") is not null || Child(persona, "errorMonotributo") is not null))
            return null;

        var impuestos = regimenGeneral?.Elements()
            .Where(e => e.Name.LocalName == "impuesto")
            .Select(e => int.TryParse(Text(e, "idImpuesto"), out var id) ? id : 0)
            .ToHashSet() ?? [];

        if (impuestos.Contains(IdImpuestoIva)) return CondicionIvaReceptor.ResponsableInscripto;
        if (impuestos.Contains(IdImpuestoIvaExento)) return CondicionIvaReceptor.Exento;
        return CondicionIvaReceptor.ConsumidorFinal;
    }

    private static string? Address(XElement generales)
    {
        var domicilio = Child(generales, "domicilioFiscal");
        if (domicilio is null) return null;

        var partes = new[] { Text(domicilio, "direccion"), Text(domicilio, "localidad"), Text(domicilio, "descripcionProvincia") }
            .Where(s => !string.IsNullOrWhiteSpace(s));
        var texto = string.Join(", ", partes);
        return texto.Length == 0 ? null : texto;
    }

    /// <summary>Los textos de <c>error</c> (y el <c>mensaje</c> fijo) de un bloque de errores.</summary>
    private static IEnumerable<string> Errors(XElement persona, string block) =>
        Child(persona, block)?.Elements()
            .Where(e => e.Name.LocalName is "error" or "mensaje")
            .Select(e => e.Value.Trim())
            .Where(v => v.Length > 0) ?? [];

    private static XElement? Find(XElement parent, string localName) =>
        parent.DescendantsAndSelf().FirstOrDefault(e => e.Name.LocalName == localName);

    /// <summary>Hijo DIRECTO: "nombre" también aparece dentro de otras estructuras (errorConstancia, por ejemplo).</summary>
    private static XElement? Child(XElement parent, string localName) =>
        parent.Elements().FirstOrDefault(e => e.Name.LocalName == localName);

    private static string? Text(XElement parent, string localName) => Child(parent, localName)?.Value.Trim();
}
