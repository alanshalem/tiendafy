using Tenancy.Core.Domain;

namespace Api.Auth;

/// <summary>
/// Desde qué orígenes del navegador se habla con la API, y con qué.
///
/// La sesión del panel (cookie <c>tiendafy.session</c>, <c>SameSite=Lax</c>) viaja en
/// todo pedido del mismo sitio, y las tiendas viven en subdominios de la
/// plataforma con <c>'unsafe-inline'</c> y con GTM, Pixel y Clarity que configura
/// cada comercio. Si un script de una tienda (un contenedor de GTM
/// comprometido, por ejemplo) pudiera usar esa sesión, actuaría como el
/// admin que visita la tienda. Por eso:
/// <list type="bullet">
/// <item>La sesión del panel solo vale sin <c>Origin</c> (navegación, pedidos del
/// mismo origen) o desde el origen del panel o de la propia API. Desde
/// cualquier otro, el pedido es anónimo para lo del panel.</item>
/// <item>CORS con credenciales: el panel, las tiendas (un solo nivel de
/// subdominio, que no sea uno reservado) y los dominios propios de
/// <c>Cors:AllowedOrigins</c>. Nunca el host de las fotos
/// (<c>Media:PublicBaseUrl</c>): ahí se sirve lo que suben los comercios.</item>
/// </list>
/// El comprador no depende de esto: su cookie (<c>shop_*</c>) solo se lee con el
/// header <c>X-Tenant-Id</c>, que exige preflight, y la tienda la usa desde su origen.
/// </summary>
public sealed class OriginRules
{
    private readonly string _platform;
    private readonly bool _development;
    private readonly HashSet<string> _panel = new(StringComparer.Ordinal);
    private readonly string? _api;
    private readonly string? _media;
    private readonly string[] _extra;

    public OriginRules(IConfiguration configuration, IHostEnvironment environment)
    {
        _platform = Api.Notifications.StoreLinks.PlatformDomainOf(configuration);
        _development = environment.IsDevelopment();
        _extra = (configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Select(Normalize).OfType<string>().ToArray();
        _api = Normalize(configuration["PublicApiBaseUrl"]);
        _media = Normalize(configuration["Media:PublicBaseUrl"]);

        // El panel: Admin:BaseUrl (el compose lo arma: https://admin.${STACK_DOMAIN}).
        // Sin configurar, admin.<dominio de la plataforma>, que es como se despliega.
        var admin = Normalize(configuration["Admin:BaseUrl"]);
        if (admin is not null) _panel.Add(admin);
        else if (_platform != "localhost") _panel.Add($"https://admin.{_platform}:443");

        PanelBaseUrl = configuration["Admin:BaseUrl"]?.Trim().TrimEnd('/') is { Length: > 0 } configured
            ? configured
            : _platform != "localhost" ? $"https://admin.{_platform}" : "http://localhost:5173";
    }

    /// <summary>
    /// La base de los links al panel que salen por mail (verificar el email,
    /// restablecer la contraseña, la bienvenida de alguien del equipo):
    /// <c>Admin:BaseUrl</c>; sin configurar, <c>admin.&lt;dominio&gt;</c> (o el
    /// panel de dev en localhost). Nunca el <c>Origin</c> del pedido: quien pide
    /// el mail de otro elegiría adónde va el link con su token.
    /// </summary>
    public string PanelBaseUrl { get; }

    /// <summary>¿Es el origen del panel? En desarrollo, además, localhost con cualquier puerto.</summary>
    public bool IsPanel(string? origin)
    {
        var o = Normalize(origin);
        if (o is null || o == _media) return false;
        if (_panel.Contains(o)) return true;
        if (!_development) return false;
        var host = new Uri(o).Host;
        return host is "localhost" or "127.0.0.1";
    }

    /// <summary>La regla de CORS (con credenciales).</summary>
    public bool IsCorsAllowed(string? origin)
    {
        var o = Normalize(origin);
        if (o is null || o == _media) return false;
        if (IsPanel(o)) return true;
        if (_extra.Contains(o)) return true;

        var host = new Uri(o).Host;
        // Dev local: las tiendas son <sub>.localhost:3000 (en producción no se aceptan).
        if (_development && (host == "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal))) return true;
        // El dominio pelado (atiende la tienda principal) y <tienda>.<dominio>: un
        // solo nivel, y no uno reservado (admin, api, img, stg…). Así quedan afuera
        // también los de staging cuando cuelga de producción (x.stg.<dominio>).
        if (host == _platform) return true;
        if (!host.EndsWith("." + _platform, StringComparison.Ordinal)) return false;
        var label = host[..^(_platform.Length + 1)];
        return !label.Contains('.') && !Subdomain.IsReserved(label);
    }

    /// <summary>
    /// ¿Vale la sesión del panel en este pedido? Sin <c>Origin</c> sí (una
    /// navegación, una descarga, un pedido sin navegador); con <c>Origin</c>, solo
    /// si es el del panel o el de la propia API.
    /// </summary>
    public bool AllowsPanelSession(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin)) return true;
        if (IsPanel(origin)) return true;
        var o = Normalize(origin);
        return o is not null && (o == _api || o == Normalize($"{request.Scheme}://{request.Host}"));
    }

    /// <summary>"esquema://host:puerto" en minúsculas, o null si no es una URL http(s).</summary>
    private static string? Normalize(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u)) return null;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return null;
        return $"{u.Scheme}://{u.Host.ToLowerInvariant()}:{u.Port}";
    }
}
