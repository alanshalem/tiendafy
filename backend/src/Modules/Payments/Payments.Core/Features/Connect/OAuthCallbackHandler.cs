using Microsoft.Extensions.Logging;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using SharedKernel.Common;

namespace Payments.Core.Features.Connect;

/// <summary>
/// Procesa el redirect OAuth de MercadoPago: valida el state, canjea el code
/// por tokens, los cifra y guarda la conexión del seller (crea o re-conecta).
/// </summary>
public sealed class OAuthCallbackHandler(
    IMercadoPagoOAuthClient client,
    ITokenProtector protector,
    IOAuthStateProtector stateProtector,
    IMercadoPagoConnectionRepository repository,
    ILogger<OAuthCallbackHandler> logger)
{
    public async Task<Result> HandleAsync(string code, string state, CancellationToken ct = default)
    {
        var tenantId = stateProtector.TryUnprotect(state);
        if (tenantId is null)
            return Result.Failure(Error.Validation("MercadoPago.InvalidState",
                "El parámetro de seguridad (state) es inválido o expiró. Reintentá la conexión."));

        MercadoPagoTokens tokens;
        try
        {
            tokens = await client.ExchangeCodeAsync(code, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "MercadoPago OAuth code exchange failed for tenant {TenantId}.", tenantId);
            return Result.Failure(new Error("MercadoPago.ExchangeFailed",
                "No se pudo completar la conexión con MercadoPago. Reintentá en unos minutos."));
        }

        var expiresAt = DateTime.UtcNow.AddSeconds(tokens.ExpiresInSeconds);
        var accessEnc = protector.Protect(tokens.AccessToken);
        var refreshEnc = string.IsNullOrEmpty(tokens.RefreshToken) ? string.Empty : protector.Protect(tokens.RefreshToken);

        var existing = await repository.GetByTenantAsync(tenantId.Value, ct);
        if (existing is null)
        {
            var connection = MercadoPagoConnection.Create(
                tenantId.Value, tokens.UserId, accessEnc, refreshEnc, tokens.PublicKey, tokens.Scope, expiresAt);
            await repository.AddAsync(connection, ct);
        }
        else
        {
            existing.UpdateTokens(tokens.UserId, accessEnc, refreshEnc, tokens.PublicKey, tokens.Scope, expiresAt);
        }

        await repository.SaveChangesAsync(ct);
        logger.LogInformation("MercadoPago connected for tenant {TenantId} (mp_user {UserId}).", tenantId, tokens.UserId);
        return Result.Success();
    }
}
