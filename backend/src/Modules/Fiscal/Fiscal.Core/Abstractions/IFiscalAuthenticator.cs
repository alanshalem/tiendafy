using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

/// <summary>Pase de acceso a un WSN de ARCA (token + firma, con vencimiento).</summary>
public sealed record FiscalTicket(string Token, string Sign, DateTime ExpiresAtUtc);

/// <summary>
/// Obtiene un Ticket de Acceso (TA) válido para un servicio de ARCA (WSAA).
/// Reusa el TA cacheado mientras esté vigente (H4: ARCA no da otro hasta que
/// venza). El TA se persiste cifrado; si el proceso reinicia, no se pierde.
/// </summary>
public interface IFiscalAuthenticator
{
    Task<Result<FiscalTicket>> GetTicketAsync(
        Guid tenantId, Cuit cuit, string service, FiscalEnvironment environment, CancellationToken ct = default);
}
