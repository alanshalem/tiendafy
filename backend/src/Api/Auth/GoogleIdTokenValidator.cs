using Google.Apis.Auth;

namespace Api.Auth;

/// <summary>Lo que importa de un id_token de Google ya verificado.</summary>
public sealed record GoogleIdentity(string? Subject, string? Email, string? Name, bool EmailVerified);

/// <summary>
/// Verifica un id_token de Google: firma contra sus llaves públicas, audiencia
/// (nuestro client id), vencimiento y emisor.
///
/// <para>
/// Está detrás de una interfaz para poder probar el login con Google de punta
/// a punta sin Google: el resto del callback (canje del código, alta o
/// vínculo del cliente, sesión, redirección segura) es nuestro y es lo que se
/// rompe.
/// </para>
/// </summary>
public interface IGoogleIdTokenValidator
{
    /// <summary>La identidad si el token es válido para ese client id; null si no.</summary>
    Task<GoogleIdentity?> ValidateAsync(string idToken, string clientId);
}

internal sealed class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    public async Task<GoogleIdentity?> ValidateAsync(string idToken, string clientId)
    {
        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
            return new GoogleIdentity(payload.Subject, payload.Email, payload.Name, payload.EmailVerified);
        }
        catch
        {
            // Firma, audiencia o vencimiento inválidos, o no se pudieron bajar las llaves.
            return null;
        }
    }
}
