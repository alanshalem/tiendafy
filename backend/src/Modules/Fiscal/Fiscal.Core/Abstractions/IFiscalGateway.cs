using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

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
}
