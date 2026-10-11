using Fiscal.Core.Domain;

namespace Fiscal.Infrastructure.Wsaa;

/// <summary>
/// Endpoints de ARCA por ambiente. Van EXPLÍCITOS (H1): el certificado TLS
/// productivo no cubre .gob.ar y la paridad de dominios no es uniforme — jamás
/// derivar un host sustituyendo el dominio.
/// </summary>
public sealed class FiscalEndpointsOptions
{
    public const string SectionName = "Fiscal:Endpoints";

    // WSAA (autenticación) — LoginCms.
    public string WsaaHomologacion { get; set; } = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
    public string WsaaProduccion { get; set; } = "https://wsaa.afip.gov.ar/ws/services/LoginCms";

    // WSFEv1 (factura electrónica).
    public string WsfeHomologacion { get; set; } = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
    public string WsfeProduccion { get; set; } = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";

    // Padrón A5 (constancia de inscripción): quién es un CUIT y su condición de IVA.
    public string PadronA5Homologacion { get; set; } = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";
    public string PadronA5Produccion { get; set; } = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";

    public string Wsaa(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? WsaaProduccion : WsaaHomologacion;

    public string Wsfe(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? WsfeProduccion : WsfeHomologacion;

    public string PadronA5(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? PadronA5Produccion : PadronA5Homologacion;
}
