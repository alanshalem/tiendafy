using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

/// <summary>
/// Códigos de error del gateway que dicen "no sabemos si ARCA lo recibió". Un
/// timeout después de mandar FECAESolicitar puede haber dejado un comprobante
/// AUTORIZADO del otro lado: reintentar a ciegas lo factura dos veces.
/// </summary>
public static class FiscalGatewayErrors
{
    public const string Network = "Wsfe.Network";
    public const string BadResponse = "Wsfe.BadResponse";

    /// <summary>
    /// Respuesta HTTP de error sin SOAP Fault (un 502 de un proxy, por
    /// ejemplo): no la mandó ARCA, así que no dice si el pedido llegó.
    /// </summary>
    public const string NoFault = "Wsfe.NoFault";

    public static bool IsAmbiguous(Error error) => error.Code is Network or BadResponse or NoFault;
}

/// <summary>Salud de WSFEv1 (FEDummy, no requiere autenticación).</summary>
public sealed record FiscalHealth(bool AppOk, bool DbOk, bool AuthOk)
{
    public bool AllOk => AppOk && DbOk && AuthOk;
}

/// <summary>Resultado de autorizar un comprobante (FECAESolicitar).</summary>
public sealed record CaeOutcome(
    string Resultado,                 // "A" aprobado | "R" rechazado | "P" parcial
    string? Cae,
    DateOnly? CaeVto,
    IReadOnlyList<FiscalMessage> Observations, // 'A' con Obs sigue siendo válido (H13)
    IReadOnlyList<FiscalMessage> Errors,
    string RequestXml,
    string ResponseXml)
{
    public bool IsAuthorized => Resultado == "A";
}

public sealed record FiscalMessage(string Code, string Message);

/// <summary>
/// Un comprobante tal como lo tiene registrado ARCA (FECompConsultar). Es la
/// fuente de verdad para reconciliar un pedido de CAE cuya respuesta se perdió:
/// si ARCA lo autorizó, el CAE está acá aunque nunca nos haya llegado.
/// </summary>
public sealed record ConsultedComprobante(
    long Number,
    DocTipo DocTipo,
    long DocNro,
    decimal ImpTotal,
    DateOnly? CbteFch,
    string Resultado,
    string? Cae,
    DateOnly? CaeVto)
{
    public bool IsAuthorized => Resultado == "A" && !string.IsNullOrEmpty(Cae);
}

/// <summary>
/// Punto de venta habilitado para Web Services según ARCA (FEParamGetPtosVenta).
/// Solo aparecen los de tipo "RECE / Web Services": los de Comprobantes en línea
/// y los de controlador fiscal NO están en esta lista, y emitir con uno de esos
/// falla con un error que no menciona el punto de venta.
/// </summary>
public sealed record ArcaPointOfSale(int Number, string EmisionTipo, bool Blocked, bool Retired)
{
    public bool Usable => !Blocked && !Retired;
}

/// <summary>
/// Puerto hacia el WSN de factura electrónica de ARCA (WSFEv1). El dominio no ve
/// tipos de ARCA: el adapter mapea el SOAP a estos records.
/// </summary>
public interface IFiscalGateway
{
    /// <summary>Chequeo de salud del servicio (no autenticado).</summary>
    Task<Result<FiscalHealth>> CheckHealthAsync(FiscalEnvironment environment, CancellationToken ct = default);

    /// <summary>Último número autorizado para (ptoVta, cbteTipo). 0 = ninguno aún.</summary>
    Task<Result<long>> GetLastAuthorizedAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment, int ptoVta, CbteTipo cbteTipo, CancellationToken ct = default);

    /// <summary>Solicita el CAE para un comprobante ya armado y numerado.</summary>
    Task<Result<CaeOutcome>> RequestCaeAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment,
        int ptoVta, long number, DateOnly cbteFch, InvoiceDraft draft, CancellationToken ct = default);

    /// <summary>
    /// Un comprobante puntual según ARCA. Null = ARCA no lo tiene (el número no
    /// se usó). Es de solo lectura: no consume numeración.
    /// </summary>
    Task<Result<ConsultedComprobante?>> ConsultAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment,
        int ptoVta, CbteTipo cbteTipo, long number, CancellationToken ct = default);

    /// <summary>
    /// Puntos de venta del emisor habilitados para Web Services. En homologación
    /// ARCA suele devolver la lista vacía (ahí cualquier número sirve): por eso
    /// el resultado distingue "no aplica" de "no está".
    /// </summary>
    Task<Result<IReadOnlyList<ArcaPointOfSale>?>> GetPointsOfSaleAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment, CancellationToken ct = default);
}
