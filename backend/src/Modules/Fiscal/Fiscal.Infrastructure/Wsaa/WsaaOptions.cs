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

    // Constancia de inscripción (ws_sr_constancia_inscripcion, ex padrón A5):
    // quién es un CUIT y su condición de IVA. El servicio cambió de nombre pero
    // la URL sigue siendo personaServiceA5. El manual v4.1 (mar-2026) ya la da
    // en arca.gob.ar, pero awshomo.arca.gob.ar no resuelve (probado el
    // 16-oct-2026): se quedan los hosts de afip.gov.ar, que andan en los dos.
    public string ConstanciaInscripcionHomologacion { get; set; } = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";
    public string ConstanciaInscripcionProduccion { get; set; } = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";

    public string Wsaa(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? WsaaProduccion : WsaaHomologacion;

    public string Wsfe(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? WsfeProduccion : WsfeHomologacion;

    public string ConstanciaInscripcion(FiscalEnvironment env) =>
        env == FiscalEnvironment.Produccion ? ConstanciaInscripcionProduccion : ConstanciaInscripcionHomologacion;
}
