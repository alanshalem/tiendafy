using System.Xml.Linq;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Padron;

/// <summary>
/// Lee la respuesta de getPersona_v2 (padrón A5) y la traduce a lo que la
/// facturación necesita: nombre y condición frente al IVA.
///
/// <para>
/// Se busca por nombre local y no por namespace, como en WSFEv1: ARCA cambia
/// prefijos entre versiones y ambientes, y los nombres son lo estable.
/// </para>
///
/// <para>
/// La condición sale de qué datos tiene la persona: si figura en el régimen
/// simplificado es monotributista; si en el régimen general tiene el impuesto
/// IVA (30) es Responsable Inscripto, y si tiene IVA EXENTO (32), exento. Sin
/// ninguno de los dos es consumidor final.
/// </para>
/// </summary>
internal static class PadronA5Response
{
    /// <summary>Impuesto "IVA" en el padrón.</summary>
    public const int IdImpuestoIva = 30;

    /// <summary>Impuesto "IVA EXENTO" en el padrón.</summary>
    public const int IdImpuestoIvaExento = 32;

    public static Result<TaxpayerInfo> Parse(XElement root, long cuit)
    {
        var persona = Find(root, "personaReturn");
        var generales = persona is null ? null : Find(persona, "datosGenerales");

        if (generales is null)
        {
            // Sin datos generales, ARCA explica por qué en errorConstancia.
            var motivo = persona is null ? null : Find(persona, "errorConstancia")?.Descendants()
                .FirstOrDefault(e => e.Name.LocalName == "error")?.Value.Trim();
            return Result.Failure<TaxpayerInfo>(Error.Validation("Padron.NotFound",
                string.IsNullOrWhiteSpace(motivo)
                    ? $"ARCA no tiene una constancia de inscripción para el CUIT {cuit}."
                    : $"ARCA: {motivo}"));
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
            Condicion(persona!),
            Address(generales));
    }

    private static CondicionIvaReceptor Condicion(XElement persona)
    {
        if (Find(persona, "datosMonotributo") is not null)
            return CondicionIvaReceptor.Monotributo;

        var impuestos = Find(persona, "datosRegimenGeneral")?.Descendants()
            .Where(e => e.Name.LocalName == "idImpuesto")
            .Select(e => int.TryParse(e.Value, out var id) ? id : 0)
            .ToHashSet() ?? [];

        if (impuestos.Contains(IdImpuestoIva)) return CondicionIvaReceptor.ResponsableInscripto;
        if (impuestos.Contains(IdImpuestoIvaExento)) return CondicionIvaReceptor.Exento;
        return CondicionIvaReceptor.ConsumidorFinal;
    }

    private static string? Address(XElement generales)
    {
        var domicilio = Find(generales, "domicilioFiscal");
        if (domicilio is null) return null;

        var partes = new[] { Text(domicilio, "direccion"), Text(domicilio, "localidad"), Text(domicilio, "descripcionProvincia") }
            .Where(s => !string.IsNullOrWhiteSpace(s));
        var texto = string.Join(", ", partes);
        return texto.Length == 0 ? null : texto;
    }

    private static XElement? Find(XElement parent, string localName) =>
        parent.Descendants().FirstOrDefault(e => e.Name.LocalName == localName);

    /// <summary>Hijo DIRECTO: "nombre" también aparece dentro de otras estructuras.</summary>
    private static string? Text(XElement parent, string localName) =>
        parent.Elements().FirstOrDefault(e => e.Name.LocalName == localName)?.Value.Trim();
}
