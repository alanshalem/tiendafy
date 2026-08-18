using SharedKernel.Common;

namespace Api.Social;

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
/// Telegram no tiene conector: se conecta con bot token por formulario.
/// </summary>
public interface ISocialConnector
{
    string Key { get; }
    string DisplayName { get; }
    bool Configured { get; }
    string BuildAuthUrl(string state);
    Task<Result<IReadOnlyList<SocialAccountCandidate>>> CompleteConnectAsync(string code, CancellationToken ct);
}
