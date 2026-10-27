using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration.EnvironmentVariables;
using Microsoft.Extensions.Configuration.Memory;

namespace Api.Platform;

public sealed record PlatformSettingsView(
    PlatformSwitchesView Switches,
    PlatformServicesView Services,
    IReadOnlyList<PlatformInfraItemView> Infrastructure,
    DateTime? UpdatedAtUtc,
    string? UpdatedByEmail);

public sealed record PlatformSwitchItemView(
    string Key,
    string EnvVar,
    bool Value,
    bool FallbackValue,
    string Source);

public sealed record PlatformSwitchesView(
    PlatformSwitchItemView RequireTwoFactorForAdmins,
    PlatformSwitchItemView AiDisabled);

public sealed record PlatformTextFieldView(
    string Key,
    string EnvVar,
    string Value,
    string FallbackValue,
    string Source);

public sealed record PlatformSecretFieldView(
    string Key,
    string EnvVar,
    bool Configured,
    string? Last4,
    bool FallbackConfigured,
    string Source);

public sealed record PlatformServicesView(
    PlatformEmailServiceView Email,
    PlatformTurnstileServiceView Turnstile,
    PlatformGoogleServiceView Google,
    PlatformMercadoPagoServiceView MercadoPago,
    PlatformOAuthPairServiceView MercadoLibre,
    PlatformAppPairServiceView MetaAds,
    PlatformSocialServiceView Social);

public sealed record PlatformEmailServiceView(
    PlatformTextFieldView From,
    PlatformSecretFieldView ResendApiKey,
    PlatformSecretFieldView WebhookSecret);

public sealed record PlatformTurnstileServiceView(
    PlatformTextFieldView SiteKey,
    PlatformSecretFieldView Secret);

public sealed record PlatformGoogleServiceView(
    PlatformTextFieldView ClientId,
    PlatformSecretFieldView ClientSecret);

public sealed record PlatformMercadoPagoServiceView(
    PlatformTextFieldView ClientId,
    PlatformSecretFieldView ClientSecret,
    PlatformSecretFieldView WebhookSecret);

public sealed record PlatformOAuthPairServiceView(
    PlatformTextFieldView ClientId,
    PlatformSecretFieldView ClientSecret);

public sealed record PlatformAppPairServiceView(
    PlatformTextFieldView AppId,
    PlatformSecretFieldView AppSecret);

public sealed record PlatformSocialServiceView(
    PlatformTextFieldView MetaAppId,
    PlatformSecretFieldView MetaAppSecret,
    PlatformTextFieldView XClientId,
    PlatformSecretFieldView XClientSecret);

public sealed record PlatformInfraItemView(
    string Key,
    string EnvVar,
    string Label,
    string Status,
    bool Configured,
    string Reason);

public sealed record UpdatePlatformSettingsRequest(
    bool? RequireTwoFactorForAdmins = null,
    bool? AiDisabled = null,
    Dictionary<string, string?>? Values = null,
    IReadOnlyList<string>? ClearKeys = null);

/// <summary>
/// Lee y actualiza la configuración operativa de la plataforma (tabla
/// <c>platform_settings</c>) y sincroniza en caliente a
/// <see cref="PlatformConfigurationProvider"/> para que los cambios impacten sin
/// reiniciar contenedores. Los secretos se cifran en reposo con DataProtection.
/// </summary>
public sealed class PlatformSettingsService(
    AppIdentityDbContext db,
    IConfiguration configuration,
    PlatformConfigurationProvider provider,
    IDataProtectionProvider dataProtection,
    ILogger<PlatformSettingsService> logger)
{
    // NUNCA cambiar este string: invalida todos los secretos de plataforma ya guardados.
    public const string ProtectorPurpose = "Tiendafy.Platform.Secrets.v1";

    public const string KeyRequireTwoFactor = "Auth:RequireTwoFactorForAdmins";
    public const string KeyAiDisabled = "Ai:Disabled";

    public const string KeyEmailFrom = "Email:From";
    public const string KeyEmailResendApiKey = "Email:ResendApiKey";
    public const string KeyEmailWebhookSecret = "Email:WebhookSecret";

    public const string KeyTurnstileSiteKey = "Captcha:Turnstile:SiteKey";
    public const string KeyTurnstileSecret = "Captcha:Turnstile:Secret";

    public const string KeyGoogleClientId = "Authentication:Google:ClientId";
    public const string KeyGoogleClientSecret = "Authentication:Google:ClientSecret";

    public const string KeyMpClientId = "MercadoPago:ClientId";
    public const string KeyMpClientSecret = "MercadoPago:ClientSecret";
    public const string KeyMpWebhookSecret = "MercadoPago:WebhookSecret";

    public const string KeyMeliClientId = "MercadoLibre:ClientId";
    public const string KeyMeliClientSecret = "MercadoLibre:ClientSecret";

    public const string KeyMetaAdsAppId = "MetaAds:AppId";
    public const string KeyMetaAdsAppSecret = "MetaAds:AppSecret";

    public const string KeySocialMetaAppId = "Social:Meta:AppId";
    public const string KeySocialMetaAppSecret = "Social:Meta:AppSecret";
    public const string KeySocialXClientId = "Social:X:ClientId";
    public const string KeySocialXClientSecret = "Social:X:ClientSecret";

    private static readonly HashSet<string> SwitchKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        KeyRequireTwoFactor,
        KeyAiDisabled,
    };

    private static readonly HashSet<string> TextKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        KeyEmailFrom,
        KeyTurnstileSiteKey,
        KeyGoogleClientId,
        KeyMpClientId,
        KeyMeliClientId,
        KeyMetaAdsAppId,
        KeySocialMetaAppId,
        KeySocialXClientId,
    };

    private static readonly HashSet<string> SecretKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        KeyEmailResendApiKey,
        KeyEmailWebhookSecret,
        KeyTurnstileSecret,
        KeyGoogleClientSecret,
        KeyMpClientSecret,
        KeyMpWebhookSecret,
        KeyMeliClientSecret,
        KeyMetaAdsAppSecret,
        KeySocialMetaAppSecret,
        KeySocialXClientSecret,
    };

    private readonly IDataProtector _protector = dataProtection.CreateProtector(ProtectorPurpose);

    public static bool IsSecretKey(string key) => SecretKeys.Contains(key);

    public static bool IsAllowedKey(string key) =>
        SwitchKeys.Contains(key) || TextKeys.Contains(key) || SecretKeys.Contains(key);

    /// <summary>
    /// Carga las filas de <c>platform_settings</c>, descifra los secretos y
    /// actualiza el proveedor en memoria de <see cref="IConfiguration"/>.
    /// </summary>
    public async Task ReloadProviderAsync(CancellationToken ct = default)
    {
        var rows = await db.PlatformSettings.AsNoTracking().ToListAsync(ct);
        var overrides = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            if (!IsAllowedKey(row.Key)) continue;
            if (IsSecretKey(row.Key))
            {
                var plain = TryUnprotect(row.Key, row.Value);
                if (!string.IsNullOrEmpty(plain))
                    overrides[row.Key] = plain;
            }
            else
            {
                overrides[row.Key] = row.Value;
            }
        }

        provider.SetOverrides(overrides);
    }

    public async Task<PlatformSettingsView> GetViewAsync(CancellationToken ct = default)
    {
        var rows = await db.PlatformSettings.AsNoTracking().ToListAsync(ct);
        var byKey = rows.ToDictionary(r => r.Key, StringComparer.OrdinalIgnoreCase);

        var latest = rows.OrderByDescending(r => r.UpdatedAtUtc).FirstOrDefault();

        var switches = new PlatformSwitchesView(
            RequireTwoFactorForAdmins: BuildSwitchView(KeyRequireTwoFactor, "AUTH_REQUIRE_2FA_ADMINS", defaultValue: true, byKey),
            AiDisabled: BuildSwitchView(KeyAiDisabled, "Ai__Disabled", defaultValue: false, byKey));

        var services = new PlatformServicesView(
            Email: new PlatformEmailServiceView(
                From: BuildTextView(KeyEmailFrom, "EMAIL_FROM", byKey),
                ResendApiKey: BuildSecretView(KeyEmailResendApiKey, "RESEND_API_KEY", byKey),
                WebhookSecret: BuildSecretView(KeyEmailWebhookSecret, "RESEND_WEBHOOK_SECRET", byKey)),
            Turnstile: new PlatformTurnstileServiceView(
                SiteKey: BuildTextView(KeyTurnstileSiteKey, "TURNSTILE_SITE_KEY", byKey),
                Secret: BuildSecretView(KeyTurnstileSecret, "TURNSTILE_SECRET", byKey)),
            Google: new PlatformGoogleServiceView(
                ClientId: BuildTextView(KeyGoogleClientId, "GOOGLE_CLIENT_ID", byKey),
                ClientSecret: BuildSecretView(KeyGoogleClientSecret, "GOOGLE_CLIENT_SECRET", byKey)),
            MercadoPago: new PlatformMercadoPagoServiceView(
                ClientId: BuildTextView(KeyMpClientId, "MP_CLIENT_ID", byKey),
                ClientSecret: BuildSecretView(KeyMpClientSecret, "MP_CLIENT_SECRET", byKey),
                WebhookSecret: BuildSecretView(KeyMpWebhookSecret, "MP_WEBHOOK_SECRET", byKey)),
            MercadoLibre: new PlatformOAuthPairServiceView(
                ClientId: BuildTextView(KeyMeliClientId, "MELI_CLIENT_ID", byKey),
                ClientSecret: BuildSecretView(KeyMeliClientSecret, "MELI_CLIENT_SECRET", byKey)),
            MetaAds: new PlatformAppPairServiceView(
                AppId: BuildTextView(KeyMetaAdsAppId, "META_ADS_APP_ID", byKey),
                AppSecret: BuildSecretView(KeyMetaAdsAppSecret, "META_ADS_APP_SECRET", byKey)),
            Social: new PlatformSocialServiceView(
                MetaAppId: BuildTextView(KeySocialMetaAppId, "SOCIAL_META_APP_ID", byKey),
                MetaAppSecret: BuildSecretView(KeySocialMetaAppSecret, "SOCIAL_META_APP_SECRET", byKey),
                XClientId: BuildTextView(KeySocialXClientId, "SOCIAL_X_CLIENT_ID", byKey),
                XClientSecret: BuildSecretView(KeySocialXClientSecret, "SOCIAL_X_CLIENT_SECRET", byKey)));

        return new PlatformSettingsView(
            Switches: switches,
            Services: services,
            Infrastructure: BuildInfrastructureView(),
            UpdatedAtUtc: latest?.UpdatedAtUtc,
            UpdatedByEmail: latest?.UpdatedByEmail);
    }

    public async Task<(PlatformSettingsView? View, string? Error)> UpdateAsync(
        UpdatePlatformSettingsRequest req,
        string? updatedByEmail,
        CancellationToken ct = default)
    {
        if (req.Values is not null)
        {
            foreach (var key in req.Values.Keys)
            {
                if (!IsAllowedKey(key))
                    return (null, $"La clave '{key}' no se puede configurar desde el panel.");
            }
        }

        if (req.ClearKeys is not null)
        {
            foreach (var key in req.ClearKeys)
            {
                if (!IsAllowedKey(key))
                    return (null, $"La clave '{key}' no es válida.");
            }
        }

        var existing = await db.PlatformSettings.ToDictionaryAsync(r => r.Key, StringComparer.OrdinalIgnoreCase, ct);

        void UpsertPlain(string canonicalKey, string value)
        {
            if (existing.TryGetValue(canonicalKey, out var row))
            {
                row.Update(value, updatedByEmail);
            }
            else
            {
                var created = PlatformSetting.Create(canonicalKey, value, updatedByEmail);
                db.PlatformSettings.Add(created);
                existing[canonicalKey] = created;
            }
        }

        void RemoveKey(string canonicalKey)
        {
            if (existing.TryGetValue(canonicalKey, out var row))
            {
                db.PlatformSettings.Remove(row);
                existing.Remove(canonicalKey);
            }
        }

        if (req.RequireTwoFactorForAdmins is { } r2fa)
            UpsertPlain(KeyRequireTwoFactor, r2fa ? "true" : "false");

        if (req.AiDisabled is { } aiDis)
            UpsertPlain(KeyAiDisabled, aiDis ? "true" : "false");

        if (req.Values is not null)
        {
            foreach (var (rawKey, rawValue) in req.Values)
            {
                var canonical = CanonicalKey(rawKey);
                if (SwitchKeys.Contains(canonical))
                {
                    if (bool.TryParse(rawValue, out var b))
                        UpsertPlain(canonical, b ? "true" : "false");
                }
                else if (SecretKeys.Contains(canonical))
                {
                    // Secreto vacío = no tocar el que ya está guardado (para borrarlo se usa clearKeys).
                    if (!string.IsNullOrWhiteSpace(rawValue))
                        UpsertPlain(canonical, _protector.Protect(rawValue.Trim()));
                }
                else if (TextKeys.Contains(canonical))
                {
                    if (rawValue is not null)
                    {
                        var trimmed = rawValue.Trim();
                        if (trimmed.Length == 0)
                            RemoveKey(canonical);
                        else
                            UpsertPlain(canonical, trimmed);
                    }
                }
            }
        }

        if (req.ClearKeys is not null)
        {
            foreach (var rawKey in req.ClearKeys)
                RemoveKey(CanonicalKey(rawKey));
        }

        await db.SaveChangesAsync(ct);
        await ReloadProviderAsync(ct);
        return (await GetViewAsync(ct), null);
    }

    private PlatformSwitchItemView BuildSwitchView(
        string key,
        string envVar,
        bool defaultValue,
        Dictionary<string, PlatformSetting> byKey)
    {
        var (fallbackRaw, hasEnvFallback) = GetFallbackValue(key);
        var fallbackBool = bool.TryParse(fallbackRaw, out var fb) ? fb : defaultValue;

        if (byKey.TryGetValue(key, out var row) && bool.TryParse(row.Value, out var dbVal))
        {
            return new PlatformSwitchItemView(
                Key: key,
                EnvVar: envVar,
                Value: dbVal,
                FallbackValue: fallbackBool,
                Source: "database");
        }

        return new PlatformSwitchItemView(
            Key: key,
            EnvVar: envVar,
            Value: fallbackBool,
            FallbackValue: fallbackBool,
            Source: hasEnvFallback ? "environment" : "default");
    }

    private PlatformTextFieldView BuildTextView(
        string key,
        string envVar,
        Dictionary<string, PlatformSetting> byKey)
    {
        var (fallbackRaw, hasEnvFallback) = GetFallbackValue(key);
        var fallbackVal = fallbackRaw ?? string.Empty;

        if (byKey.TryGetValue(key, out var row) && !string.IsNullOrWhiteSpace(row.Value))
        {
            return new PlatformTextFieldView(
                Key: key,
                EnvVar: envVar,
                Value: row.Value,
                FallbackValue: fallbackVal,
                Source: "database");
        }

        return new PlatformTextFieldView(
            Key: key,
            EnvVar: envVar,
            Value: fallbackVal,
            FallbackValue: fallbackVal,
            Source: !string.IsNullOrWhiteSpace(fallbackVal) && hasEnvFallback ? "environment" : "default");
    }

    private PlatformSecretFieldView BuildSecretView(
        string key,
        string envVar,
        Dictionary<string, PlatformSetting> byKey)
    {
        var (fallbackRaw, _) = GetFallbackValue(key);
        var fallbackConfigured = !string.IsNullOrWhiteSpace(fallbackRaw);

        if (byKey.TryGetValue(key, out var row))
        {
            var plain = TryUnprotect(key, row.Value);
            if (!string.IsNullOrEmpty(plain))
            {
                return new PlatformSecretFieldView(
                    Key: key,
                    EnvVar: envVar,
                    Configured: true,
                    Last4: MaskLast4(plain),
                    FallbackConfigured: fallbackConfigured,
                    Source: "database");
            }
        }

        if (fallbackConfigured)
        {
            return new PlatformSecretFieldView(
                Key: key,
                EnvVar: envVar,
                Configured: true,
                Last4: MaskLast4(fallbackRaw!),
                FallbackConfigured: true,
                Source: "environment");
        }

        return new PlatformSecretFieldView(
            Key: key,
            EnvVar: envVar,
            Configured: false,
            Last4: null,
            FallbackConfigured: false,
            Source: "default");
    }

    /// <summary>
    /// Busca el valor en las fuentes de configuración debajo de
    /// <see cref="PlatformConfigurationProvider"/> (<c>.env.prod</c>, variables
    /// de entorno y <c>appsettings.json</c>).
    /// </summary>
    private (string? Value, bool FromEnvOrOverride) GetFallbackValue(string key)
    {
        if (configuration is not IConfigurationRoot root)
            return (configuration[key], false);

        string? found = null;
        var fromEnv = false;

        foreach (var src in root.Providers)
        {
            if (ReferenceEquals(src, provider)) continue;
            if (src.TryGet(key, out var val))
            {
                found = val;
                if (src is EnvironmentVariablesConfigurationProvider or MemoryConfigurationProvider)
                    fromEnv = true;
            }
        }

        return (found, fromEnv);
    }

    private IReadOnlyList<PlatformInfraItemView> BuildInfrastructureView()
    {
        var baseDomain = configuration["Cors:BaseDomain"];
        var adminUrl = configuration["Admin:BaseUrl"];
        var dpKeyPath = configuration["DataProtection:KeyPath"];
        var pubBucket = configuration["Media:PublicBucket"];
        var privBucket = configuration["Media:PrivateBucket"];
        var mediaEndpoint = configuration["Media:Endpoint"];
        var workersEnabled = configuration.GetValue("Workers:Enabled", true);
        var revalidateSecret = configuration["Storefront:RevalidateSecret"];
        var sentryDsn = configuration["Sentry:Dsn"];

        return
        [
            new PlatformInfraItemView(
                Key: "Cors:BaseDomain",
                EnvVar: "STACK_DOMAIN / PRIMARY_STORE_SUBDOMAIN",
                Label: "Dominio principal y tienda raíz",
                Status: !string.IsNullOrWhiteSpace(baseDomain)
                    ? $"{baseDomain} (panel: {adminUrl ?? "—"})"
                    : $"Local / desarrollo ({adminUrl ?? "http://localhost:5173"})",
                Configured: true,
                Reason: "Define los certificados TLS en Caddy, el aislamiento de cookies y los orígenes permitidos al levantar los contenedores."),
            new PlatformInfraItemView(
                Key: "ConnectionStrings:Default",
                EnvVar: "POSTGRES_PASSWORD",
                Label: "Base de datos PostgreSQL",
                Status: "Conectada",
                Configured: true,
                Reason: "La API necesita conectarse a Postgres antes de poder leer cualquier tabla. Mantenerla fuera del panel impide que una sesión comprometida redirija la plataforma a otra base."),
            new PlatformInfraItemView(
                Key: "DataProtection:KeyPath",
                EnvVar: "DataProtection__KeyPath",
                Label: "Llaves maestras de cifrado (DataProtection)",
                Status: !string.IsNullOrWhiteSpace(dpKeyPath)
                    ? $"Volumen persistente ({dpKeyPath})"
                    : "Llaves locales de desarrollo",
                Configured: !string.IsNullOrWhiteSpace(dpKeyPath),
                Reason: "Con estas llaves se cifran los secretos guardados en la base de datos (incluidos los de esta pantalla, ARCA, Mercado Pago y datos personales). Nunca viven dentro de la misma base."),
            new PlatformInfraItemView(
                Key: "Media:Endpoint",
                EnvVar: "MEDIA_ENDPOINT / MEDIA_ACCESS_KEY / MEDIA_SECRET_KEY",
                Label: "Almacenamiento de imágenes y archivos (R2 / S3)",
                Status: $"Público: {pubBucket ?? "—"} · Privado: {privBucket ?? "—"}",
                Configured: !string.IsNullOrWhiteSpace(mediaEndpoint),
                Reason: "Protege el bucket de fotos del catálogo y el bucket privado de facturas y comprobantes. Queda fijo en .env.prod para que nadie pueda cambiar el destino ni extraer las llaves desde la web."),
            new PlatformInfraItemView(
                Key: "BrandAndLimits",
                EnvVar: "BRAND_NAME / *_PORT / *_MEM_LIMIT",
                Label: "Marca de la instalación, puertos y techos de RAM",
                Status: "Fijados al crear los contenedores",
                Configured: true,
                Reason: "Docker asigna los puertos internos y los límites de memoria al iniciar cada contenedor, y el contenedor del panel genera su config.js al arrancar."),
            new PlatformInfraItemView(
                Key: "Workers:Enabled",
                EnvVar: "WORKERS_ENABLED",
                Label: "Tareas en segundo plano (Workers)",
                Status: workersEnabled ? "Activos en esta instancia" : "Apagados en esta instancia",
                Configured: workersEnabled,
                Reason: "Los procesos de fondo (webhooks de pago, emisión en ARCA, carritos abandonados, campañas y alertas de stock) se registran en el arranque del contenedor."),
            new PlatformInfraItemView(
                Key: "Storefront:RevalidateSecret",
                EnvVar: "REVALIDATE_SECRET",
                Label: "Invalidación instantánea de caché de la tienda",
                Status: !string.IsNullOrWhiteSpace(revalidateSecret)
                    ? "Configurado (secreto compartido con el storefront)"
                    : "Sin configurar (la caché vence sola por tiempo)",
                Configured: !string.IsNullOrWhiteSpace(revalidateSecret),
                Reason: "Es un secreto compartido entre el contenedor de la API y el contenedor de Next.js (storefront); ambos contenedores lo leen de .env.prod al levantar."),
            new PlatformInfraItemView(
                Key: "Sentry:Dsn",
                EnvVar: "SENTRY_DSN_API / SENTRY_DSN_WEB / SENTRY_DSN_ADMIN",
                Label: "Monitoreo de errores (Sentry)",
                Status: !string.IsNullOrWhiteSpace(sentryDsn) ? "Activo en la API" : "Desactivado (sin DSN)",
                Configured: !string.IsNullOrWhiteSpace(sentryDsn),
                Reason: "El SDK de Sentry se inicializa al construir el proceso de la API, la tienda y el panel."),
        ];
    }

    private string? TryUnprotect(string key, string protectedValue)
    {
        if (string.IsNullOrWhiteSpace(protectedValue)) return null;
        try
        {
            return _protector.Unprotect(protectedValue);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo descifrar el ajuste de plataforma {Key}.", key);
            return null;
        }
    }

    private static string MaskLast4(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length <= 4 ? trimmed : trimmed[^4..];
    }

    private static string CanonicalKey(string rawKey)
    {
        foreach (var k in SwitchKeys.Concat(TextKeys).Concat(SecretKeys))
        {
            if (string.Equals(k, rawKey, StringComparison.OrdinalIgnoreCase))
                return k;
        }
        return rawKey;
    }
}
