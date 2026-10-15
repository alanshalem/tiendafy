using SharedKernel.Common;

namespace Social.Contracts;

/*
 * El puerto de una red social y los tipos que lo rodean.
 *
 * Vivia en la Api, al lado de los conectores que lo implementan. Eso deja la
 * dependencia al reves: quien define la capacidad es el modulo, y quien se
 * adapta a ella es el conector. Mientras el puerto estuvo afuera, el modulo
 * Social no podia hablar de publicar sin referenciar a la Api entera.
 */

/// <summary>Capacidades declarativas de una red (diseño Mixpost): el composer valida con esto.</summary>
public sealed record SocialChannelLimits(int MaxChars, int MaxImages, bool RequiresMedia);

/// <summary>Cuenta que un conector encontró al completar el OAuth (una página, un perfil…).</summary>
public sealed record SocialAccountCandidate(
    string Provider, string ProviderId, string Name, string? Username, string? AvatarUrl,
    string TokenJson, string? DataJson = null);

public enum SocialPublishStatus { Ok, RateLimited, Unauthorized, Error }

/// <summary>
/// Resultado normalizado de publicar (diseño Mixpost): el worker no conoce
/// redes — cada canal traduce su HTTP a esto.
/// </summary>
public sealed record SocialPublishResult(
    SocialPublishStatus Status,
    string? ProviderPostId = null,
    string? ExternalUrl = null,
    string? Message = null,
    TimeSpan? RetryAfter = null)
{
    public static SocialPublishResult Ok(string? id, string? url) => new(SocialPublishStatus.Ok, id, url);

    public static SocialPublishResult Fail(string message) => new(SocialPublishStatus.Error, Message: message);

    public static SocialPublishResult Unauthorized() => new(SocialPublishStatus.Unauthorized, Message: "Token vencido: reconectá la cuenta.");
}

/// <summary>Publica en UN tipo de cuenta (meta_facebook, meta_instagram, x, telegram).</summary>
public interface ISocialChannel
{
    string Key { get; }
    string DisplayName { get; }
    SocialChannelLimits Limits { get; }

    Task<SocialPublishResult> PublishAsync(
        string tokenJson, string? dataJson, string text, IReadOnlyList<string> mediaUrls, CancellationToken ct);
}

/// <summary>
/// Canal cuyo token vence y se renueva antes de publicar (X). El refresh token
/// de esas redes es de un solo uso: quien lo usa (el publicador) serializa la
/// renovación por cuenta y guarda el token nuevo apenas vuelve, ANTES de
/// publicar. Si el token nuevo viajaba en el resultado de publicar, un error
/// de red al publicar lo perdía y la cuenta quedaba muerta.
/// </summary>
public interface ISocialTokenRefresher
{
    /// <summary>Sin salir a la red: ¿el token vence pronto?</summary>
    bool NeedsRenewal(string tokenJson);

    /// <summary>
    /// Renueva. Devuelve el token JSON nuevo, o null si la red rechazó la
    /// renovación (hay que reconectar). Un error de red sale como excepción:
    /// el refresh token viejo puede seguir sirviendo.
    /// </summary>
    Task<string?> RenewAsync(string tokenJson, CancellationToken ct);
}

/// <summary>
/// Flujo de conexión OAuth (un conector puede producir varias cuentas: el de
/// Meta devuelve todas las páginas de Facebook y sus perfiles de Instagram).
/// Con UsesPkce el endpoint genera el verifier y lo pasa (viaja dentro del
/// state cifrado); los demás reciben null y lo ignoran.
/// Telegram no tiene conector: se conecta con bot token por formulario.
/// </summary>
public interface ISocialConnector
{
    string Key { get; }
    string DisplayName { get; }
    bool Configured { get; }
    bool UsesPkce { get; }
    string BuildAuthUrl(string state, string? verifier);
    Task<Result<IReadOnlyList<SocialAccountCandidate>>> CompleteConnectAsync(string code, string? verifier, CancellationToken ct);
}
