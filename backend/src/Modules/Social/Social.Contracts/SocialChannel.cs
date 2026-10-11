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
/// redes — cada canal traduce su HTTP a esto. RefreshedTokenJson viene cuando
/// el canal renovó el token durante la publicación (el worker lo persiste).
/// </summary>
public sealed record SocialPublishResult(
    SocialPublishStatus Status,
    string? ProviderPostId = null,
    string? ExternalUrl = null,
    string? Message = null,
    TimeSpan? RetryAfter = null,
    string? RefreshedTokenJson = null)
{
    public static SocialPublishResult Ok(string? id, string? url, string? refreshedToken = null) =>
        new(SocialPublishStatus.Ok, id, url, RefreshedTokenJson: refreshedToken);

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
