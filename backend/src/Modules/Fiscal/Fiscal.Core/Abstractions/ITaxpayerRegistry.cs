using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

/// <summary>
/// Lo que ARCA dice de un contribuyente: quién es y cuál es su condición frente
/// al IVA. Es la fuente de verdad que el número de CUIT por sí solo no da —el
/// prefijo distingue sociedad de persona, pero no si una persona es
/// monotributista o Responsable Inscripto—.
/// </summary>
/// <param name="Cuit">El CUIT consultado.</param>
/// <param name="Name">Razón social, o apellido y nombre.</param>
/// <param name="IsCompany">Persona jurídica.</param>
/// <param name="Condicion">Condición frente al IVA según su inscripción.</param>
/// <param name="Address">Domicilio fiscal, si ARCA lo devuelve.</param>
public sealed record TaxpayerInfo(long Cuit, string Name, bool IsCompany, CondicionIvaReceptor Condicion, string? Address);

/// <summary>Consulta del padrón de ARCA: la constancia de inscripción (servicio ws_sr_constancia_inscripcion, ex padrón A5).</summary>
public interface ITaxpayerRegistry
{
    /// <summary>
    /// Consulta con el certificado y el CUIT emisor de la tienda. Falla con un
    /// mensaje accionable si la tienda no tiene ARCA configurado, si el
    /// certificado no está habilitado para el padrón, o si el CUIT no figura.
    /// </summary>
    Task<Result<TaxpayerInfo>> LookupAsync(Guid tenantId, Cuit cuit, CancellationToken ct = default);
}
