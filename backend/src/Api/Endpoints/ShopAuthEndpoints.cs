using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Api.Auth;
using Api.Notifications;
using Api.Shop;
using Customers.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>Auth de comprador del storefront: email/password + Google OAuth. Tenant por header.</summary>
public static class ShopAuthEndpoints
{
    /// <summary>
    /// Lo que contesta el registro, haya o no una cuenta con ese email: así no
    /// sirve para averiguar quién compra en la tienda.
    /// </summary>
    public const string RegisterMessage = "Te mandamos un mail para activar tu cuenta. Revisá tu correo (y el spam).";

    /// <summary>
    /// Cookie que ata el login con Google al navegador que lo empezó (ver
    /// <c>/google/start</c>). Solo viaja a las rutas de Google.
    /// </summary>
    private const string GoogleNonceCookie = "shop_google_nonce";
    private const string GoogleCookiePath = "/api/v1/shop/auth/google";
    private static readonly TimeSpan GoogleFlowLifetime = TimeSpan.FromMinutes(15);

    public static RouteGroupBuilder MapShopAuthEndpoints(this RouteGroupBuilder group)
    {
        var auth = group.MapGroup("/shop/auth");

        // Registro: pide nombre y email, NO contraseña. Manda el mail de
        // activación, cuyo link lleva a "Elegí tu contraseña" (/verify): la
        // contraseña la pone siempre quien controla el email, así nadie puede
        // dejar puesta la suya en la cuenta de otro. No abre sesión. Si ya hay
        // una cuenta (con contraseña o Google), contesta exactamente lo mismo
        // sin tocar nada y al dueño le llega un aviso. Los dos caminos mandan
        // un mail y contestan lo mismo.
        auth.MapPost("/register", async (ShopRegisterRequest req, HttpContext http, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha, CustomersDbContext db, ShopperAccountEmails emails, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Problem("Captcha.Failed", "Verificación anti-bots fallida.", 400);
            var tid = tenant.TenantId.Value;
            var email = ShopAuth.NormalizeEmail(req.Email);

            // Valida nombre y email igual que siempre (antes de mirar si existe).
            var created = Customer.CreateShopper(tid, req.Name, email ?? req.Email);
            if (created.IsFailure) return created.Error.ToProblem();
            var fresh = created.Value;

            var rows = await db.Customers
                .Where(c => c.TenantId == tid && c.Email == fresh.Email)
                .OrderBy(c => c.CreatedAtUtc)
                .ToListAsync(ct);
            // Una cuenta de comprador es la que tiene contraseña o Google.
            if (rows.FirstOrDefault(c => c.PasswordHash != null || c.GoogleSubject != null) is { } owner)
            {
                await emails.SendRegistrationAttemptAsync(tid, owner.Email!, owner.Name, StoreLink(http, cfg, "/cuenta"), ct);
                return Registered();
            }

            // Sin cuenta todavía: un registro anterior sin activar o la ficha de
            // la agenda (creada por una compra) pasan a ser la cuenta; si no hay
            // ninguno, se crea. Registrarse de nuevo solo manda otro link.
            var customer = rows.FirstOrDefault();
            if (customer is null)
            {
                customer = fresh;
                db.Customers.Add(customer);
            }
            var verifyTok = ShopAuth.NewToken();
            db.CustomerTokens.Add(CustomerToken.Issue(tid, customer.Id, CustomerToken.PurposeVerify, verifyTok, TimeSpan.FromDays(3)));
            await db.SaveChangesAsync(ct);
            // Con la plantilla "Activación de cuenta" de la tienda (sale siempre).
            await emails.SendActivationAsync(tid, customer.Email!, customer.Name,
                BuildLink(http, cfg, "/cuenta/verificar", verifyTok), ct);
            return Registered();
        }).RequireRateLimiting("auth");

        // ¿Olvidaste tu contraseña? Manda email con link de reset. Respuesta
        // uniforme (204) exista o no el email, y en el mismo tiempo: el token y
        // el mail se arman después de contestar (ShopperMailDispatch).
        auth.MapPost("/forgot", async (ShopForgotRequest req, HttpContext http, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha, CustomersDbContext db, ShopperMailDispatch dispatch, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Problem("Captcha.Failed", "Verificación anti-bots fallida.", 400);
            var tid = tenant.TenantId.Value;
            var addr = ShopAuth.NormalizeEmail(req.Email);
            var customerId = await db.Customers
                .Where(c => c.TenantId == tid && c.Email == addr && (c.PasswordHash != null || c.GoogleSubject != null))
                .Select(c => (Guid?)c.Id)
                .FirstOrDefaultAsync(ct);
            if (customerId is { } id)
            {
                var linkBase = LinkBase(http, cfg);
                dispatch.Run(tid, async (sp, token) =>
                {
                    var scoped = sp.GetRequiredService<CustomersDbContext>();
                    var customer = await scoped.Customers.FirstOrDefaultAsync(c => c.Id == id, token);
                    if (customer?.Email is null) return;
                    var tok = ShopAuth.NewToken();
                    scoped.CustomerTokens.Add(CustomerToken.Issue(tid, id, CustomerToken.PurposeReset, tok, TimeSpan.FromHours(1)));
                    await scoped.SaveChangesAsync(token);
                    // Con la plantilla "Cambio de contraseña" de la tienda (sale siempre).
                    await sp.GetRequiredService<ShopperAccountEmails>().SendPasswordResetAsync(
                        tid, customer.Email, customer.Name, $"{linkBase}/cuenta/reset?token={Uri.EscapeDataString(tok)}", token);
                });
            }
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        // Aplica el reset: valida el token, setea la nueva contraseña y loguea.
        // Cierra las demás sesiones: quien tenía la contraseña vieja (o la puso
        // antes de que el dueño verificara el email) queda afuera.
        auth.MapPost("/reset", async (ShopResetRequest req, HttpContext http, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                return Problem("ShopAuth.WeakPassword", "La contraseña debe tener al menos 8 caracteres.", 400);
            var tid = tenant.TenantId.Value;
            var row = await FindTokenAsync(db, tid, req.Token, ct);
            if (row is null || !row.IsValid(CustomerToken.PurposeReset))
                return Problem("ShopAuth.InvalidToken", "El link no es válido o expiró. Pedí uno nuevo.", 400);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == row.CustomerId, ct);
            if (customer is null) return Problem("ShopAuth.InvalidToken", "El link no es válido.", 400);

            customer.SetPasswordHash(ShopAuth.HashPassword(customer, req.Password));
            customer.MarkEmailVerified(); // resetear prueba acceso al email
            row.Consume();
            await ShopAuth.RevokeSessionsAsync(db, customer.Id, ct);
            var session = IssueSession(db, customer.Id, tid);
            await db.SaveChangesAsync(ct);
            ShopAuth.SetSessionCookie(http, tid, session);
            return Results.Ok(new { customer = ToDto(customer) });
        }).RequireRateLimiting("auth");

        // "Elegí tu contraseña", desde el link del mail de activación: verifica
        // el email, guarda la contraseña y abre la sesión. Es el único lugar
        // donde una cuenta nueva queda logueada. Las sesiones de antes se
        // cierran (una cuenta vieja que entró con contraseña sin verificar).
        auth.MapPost("/verify", async (ShopVerifyRequest req, HttpContext http, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                return Problem("ShopAuth.WeakPassword", "La contraseña debe tener al menos 8 caracteres.", 400);
            var tid = tenant.TenantId.Value;
            var row = await FindTokenAsync(db, tid, req.Token, ct);
            if (row is null || row.Purpose != CustomerToken.PurposeVerify)
                return Problem("ShopAuth.InvalidToken", "El link no es válido. Volvé a registrarte para recibir uno nuevo.", 400);
            if (row.UsedAtUtc is not null)
                return Problem("ShopAuth.TokenUsed", "Este link ya se usó. Si ya elegiste tu contraseña, iniciá sesión.", 400);
            if (!row.IsValid(CustomerToken.PurposeVerify))
                return Problem("ShopAuth.TokenExpired", "El link venció. Volvé a registrarte con tu email para recibir uno nuevo.", 400);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == row.CustomerId, ct);
            if (customer is null) return Problem("ShopAuth.InvalidToken", "El link no es válido.", 400);
            // Una cuenta ya activa con su contraseña no se pisa por acá: para
            // cambiarla está "¿Olvidaste tu contraseña?".
            if (customer.EmailVerified && customer.PasswordHash is not null)
                return Problem("ShopAuth.AlreadyActive", "Tu cuenta ya está activa. Iniciá sesión con tu contraseña.", 409);

            customer.SetPasswordHash(ShopAuth.HashPassword(customer, req.Password));
            customer.MarkEmailVerified();
            row.Consume();
            await ShopAuth.RevokeSessionsAsync(db, customer.Id, ct);
            var session = IssueSession(db, customer.Id, tid);
            await db.SaveChangesAsync(ct);
            ShopAuth.SetSessionCookie(http, tid, session);
            return Results.Ok(new { customer = ToDto(customer) });
        }).RequireRateLimiting("auth");

        // Reenvía el mail de activación a la cuenta logueada (entró con su
        // contraseña sin haber verificado el email). Solo a su propio email.
        auth.MapPost("/verify/resend", async (HttpContext http, ITenantContext tenant, CustomersDbContext db, ShopperAccountEmails emails, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            if (customer.EmailVerified || string.IsNullOrEmpty(customer.Email)) return Results.NoContent();
            var tid = tenant.TenantId.Value;
            var tok = ShopAuth.NewToken();
            db.CustomerTokens.Add(CustomerToken.Issue(tid, customer.Id, CustomerToken.PurposeVerify, tok, TimeSpan.FromDays(3)));
            await db.SaveChangesAsync(ct);
            await emails.SendActivationAsync(tid, customer.Email, customer.Name,
                BuildLink(http, cfg, "/cuenta/verificar", tok), ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        auth.MapPost("/login", async (ShopLoginRequest req, HttpContext http, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Problem("Captcha.Failed", "Verificación anti-bots fallida.", 400);
            var tid = tenant.TenantId.Value;
            var email = ShopAuth.NormalizeEmail(req.Email);
            // Solo cuentas con contraseña: un registro de la agenda con el mismo
            // email no tiene clave y respondería más rápido que el hash.
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Email == email && c.PasswordHash != null, ct);
            if (customer is null)
            {
                ShopAuth.BurnPassword(req.Password ?? string.Empty); // iguala timing
                return Problem("ShopAuth.InvalidCredentials", "Email o contraseña incorrectos.", 401);
            }
            if (!ShopAuth.VerifyPassword(customer, req.Password ?? string.Empty))
                return Problem("ShopAuth.InvalidCredentials", "Email o contraseña incorrectos.", 401);
            var token = IssueSession(db, customer.Id, tid);
            await db.SaveChangesAsync(ct);
            ShopAuth.SetSessionCookie(http, tid, token);
            return Results.Ok(new { customer = ToDto(customer) });
        }).RequireRateLimiting("auth");

        auth.MapPost("/logout", async (HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            await ShopAuth.LogoutAsync(http, db, ct);
            return Results.NoContent();
        });

        auth.MapGet("/me", async (HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            return customer is null ? Results.Unauthorized() : Results.Ok(ToDto(customer));
        });

        // ¿Está configurado el login con Google? Lo usa el modal para mostrar/ocultar el botón.
        auth.MapGet("/google/configured", (IConfiguration cfg) =>
            Results.Ok(new { configured = !string.IsNullOrEmpty(cfg["Authentication:Google:ClientId"]) }));

        // --- Google OAuth (authorization code). Gated por config del server. ---
        // `tenant` va por query (no header): el browser navega acá directo, sin XHR.
        auth.MapGet("/google/start", (IConfiguration cfg, HttpContext http, IDataProtectionProvider dp, string tenant, string? @return) =>
        {
            if (!Guid.TryParse(tenant, out var tid)) return Problem("ShopAuth.BadTenant", "Tenant inválido.", 400);
            var clientId = cfg["Authentication:Google:ClientId"];
            if (string.IsNullOrEmpty(clientId))
                return Problem("ShopAuth.GoogleNotConfigured", "Login con Google no está configurado en el servidor.", 501);
            var redirectUri = $"{http.Request.Scheme}://{http.Request.Host}/api/v1/shop/auth/google/callback";

            // El state va atado a ESTE navegador: lleva un nonce que también
            // queda en una cookie HttpOnly. Sin eso, alguien podría mandarle a
            // otro el link del callback con SU código de Google y dejarlo
            // logueado en la cuenta del atacante (login CSRF): lo que esa
            // persona guarde o compre después queda a la vista del atacante.
            var nonce = ShopAuth.NewToken();
            http.Response.Cookies.Append(GoogleNonceCookie, nonce, GoogleCookieOptions(http));

            // State FIRMADO y con expiración: evita que se forjen/reutilicen callbacks.
            var state = GoogleStateProtector(dp).Protect($"{tid}|{nonce}|{@return ?? string.Empty}", GoogleFlowLifetime);
            var url = "https://accounts.google.com/o/oauth2/v2/auth?" +
                $"client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                "&response_type=code&scope=openid%20email%20profile&access_type=online&prompt=select_account" +
                $"&state={Uri.EscapeDataString(state)}";
            return Results.Redirect(url);
        });

        auth.MapGet("/google/callback", async (string? code, string? state, IConfiguration cfg, IHttpClientFactory httpFactory, IDataProtectionProvider dp, IGoogleIdTokenValidator google, CustomersDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var clientId = cfg["Authentication:Google:ClientId"];
            var clientSecret = cfg["Authentication:Google:ClientSecret"];
            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
                return Problem("ShopAuth.GoogleNotConfigured", "Login con Google no está configurado.", 501);

            // El nonce del navegador se usa una vez: se borra pase lo que pase.
            var browserNonce = http.Request.Cookies[GoogleNonceCookie];
            http.Response.Cookies.Delete(GoogleNonceCookie, GoogleCookieOptions(http));

            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Problem("ShopAuth.GoogleError", "Faltan parámetros del callback.", 400);

            string tenantPart, nonce, returnUrl;
            try
            {
                var decoded = GoogleStateProtector(dp).Unprotect(state).Split('|', 3);
                if (decoded.Length < 3) throw new FormatException("state sin nonce");
                (tenantPart, nonce, returnUrl) = (decoded[0], decoded[1], decoded[2]);
            }
            catch { return Problem("ShopAuth.GoogleError", "State inválido o vencido.", 400); }
            if (!Guid.TryParse(tenantPart, out var tid)) return Problem("ShopAuth.GoogleError", "Tenant inválido.", 400);
            if (string.IsNullOrEmpty(browserNonce)
                || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(browserNonce), Encoding.UTF8.GetBytes(nonce)))
                return Problem("ShopAuth.GoogleError", "El ingreso con Google no se empezó en este navegador. Probá de nuevo.", 400);

            var redirectUri = $"{http.Request.Scheme}://{http.Request.Host}/api/v1/shop/auth/google/callback";
            var client = httpFactory.CreateClient();
            var tokenResp = await client.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code",
            }), ct);
            if (!tokenResp.IsSuccessStatusCode) return Problem("ShopAuth.GoogleError", "No se pudo validar con Google.", 502);

            using var tokenDoc = JsonDocument.Parse(await tokenResp.Content.ReadAsStringAsync(ct));
            var idToken = tokenDoc.RootElement.TryGetProperty("id_token", out var it) ? it.GetString() : null;
            if (string.IsNullOrEmpty(idToken)) return Problem("ShopAuth.GoogleError", "Sin id_token.", 502);

            // Verificamos firma + aud + exp + iss contra las llaves públicas de Google.
            var gp = await google.ValidateAsync(idToken, clientId);
            if (gp is null) return Problem("ShopAuth.GoogleError", "id_token inválido.", 502);
            var sub = gp.Subject;
            var email = ShopAuth.NormalizeEmail(gp.Email);
            var name = string.IsNullOrWhiteSpace(gp.Name) ? email : gp.Name;
            // Sin email verificado por Google no se vincula ni se crea nada por email.
            if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(email) || !gp.EmailVerified)
                return Problem("ShopAuth.GoogleError", "Google no devolvió un email verificado.", 502);

            // La cuenta de comprador antes que un registro de la agenda con el mismo email.
            var customer = await db.Customers
                .Where(c => c.TenantId == tid && c.Email == email)
                .OrderByDescending(c => c.PasswordHash != null || c.GoogleSubject != null)
                .FirstOrDefaultAsync(ct);
            if (customer is null)
            {
                var created = Customer.CreateShopper(tid, name, email, emailVerified: true);
                if (created.IsFailure) return created.Error.ToProblem();
                customer = created.Value;
                customer.LinkGoogle(sub);
                db.Customers.Add(customer);
            }
            else if (customer.LinkGoogle(sub))
            {
                // Era una cuenta sin verificar: su contraseña pudo ponerla otro
                // (LinkGoogle la borró) y sus sesiones también se cierran.
                await ShopAuth.RevokeSessionsAsync(db, customer.Id, ct);
            }
            var token = IssueSession(db, customer.Id, tid);
            await db.SaveChangesAsync(ct);

            // Sesión en cookie HttpOnly (ya no viaja el token por la URL). El storefront
            // lee /me al volver. Solo redirigimos a destinos propios (anti open-redirect).
            ShopAuth.SetSessionCookie(http, tid, token);
            var dest = IsSafeReturnUrl(returnUrl, cfg) ? returnUrl : "/";
            return Results.Redirect(dest);
        });

        return group;
    }

    private static IResult Registered() => Results.Json(new { message = RegisterMessage }, statusCode: StatusCodes.Status202Accepted);

    /// <summary>El token del link (reset o verificación), buscado por su hash.</summary>
    private static Task<CustomerToken?> FindTokenAsync(CustomersDbContext db, Guid tid, string? token, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(token)) return Task.FromResult<CustomerToken?>(null);
        var hash = ShopperTokenHash.Of(token);
        return db.CustomerTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.TenantId == tid, ct);
    }

    /// <summary>
    /// La cookie del nonce de Google: HttpOnly, SameSite=Lax (la vuelta de
    /// Google es una navegación de primer nivel, así que viaja) y Secure en
    /// HTTPS, como la de la sesión (en dev la API corre en http://localhost).
    /// </summary>
    private static CookieOptions GoogleCookieOptions(HttpContext http) => new()
    {
        HttpOnly = true,
        Secure = http.Request.IsHttps,
        SameSite = SameSiteMode.Lax,
        Path = GoogleCookiePath,
        IsEssential = true,
        MaxAge = GoogleFlowLifetime,
    };

    /// <summary>
    /// Agrega una sesión nueva al contexto y devuelve su token. No guarda: lo
    /// hace quien la pidió, junto con el resto de lo que cambió en el request.
    /// </summary>
    private static string IssueSession(CustomersDbContext db, Guid customerId, Guid tid)
    {
        var token = ShopAuth.NewToken();
        db.CustomerSessions.Add(CustomerSession.Issue(customerId, tid, token, ShopAuth.SessionLifetime));
        return token;
    }

    /// <summary>
    /// El destino del callback OAuth debe ser propio: path relativo, o un host de
    /// la plataforma (localhost/*.localhost en dev, dominio de plataforma + subdominios
    /// de tienda en prod). Evita open-redirect que filtraría el token de sesión.
    /// </summary>
    private static bool IsSafeReturnUrl(string? url, IConfiguration cfg) =>
        Api.Auth.SafeRedirect.IsSafeReturnUrl(url, cfg);

    /// <summary>Protector con expiración para el `state` del OAuth de Google (firma + TTL).</summary>
    private static ITimeLimitedDataProtector GoogleStateProtector(IDataProtectionProvider dp) =>
        dp.CreateProtector("tiendafy.shop.google.oauth.state").ToTimeLimitedDataProtector();

    private static IResult Problem(string title, string detail, int status) => Results.Problem(title: title, detail: detail, statusCode: status);

    /// <summary>La tienda según el Origin del request (validado). Vacío si no es propio: el link queda relativo.</summary>
    private static string LinkBase(HttpContext http, IConfiguration cfg)
    {
        var origin = http.Request.Headers.Origin.ToString();
        return IsSafeReturnUrl(origin, cfg) ? origin.TrimEnd('/') : string.Empty;
    }

    /// <summary>Link a la tienda con el token, usando el Origin del request (validado).</summary>
    private static string BuildLink(HttpContext http, IConfiguration cfg, string path, string token) =>
        $"{LinkBase(http, cfg)}{path}?token={Uri.EscapeDataString(token)}";

    /// <summary>Link a una página de la tienda, sin token.</summary>
    private static string StoreLink(HttpContext http, IConfiguration cfg, string path) =>
        $"{LinkBase(http, cfg)}{path}";

    internal static object ToDto(Customer c) => new { id = c.Id, name = c.Name, email = c.Email, emailVerified = c.EmailVerified };
}
