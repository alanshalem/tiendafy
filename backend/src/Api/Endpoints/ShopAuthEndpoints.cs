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
    public static RouteGroupBuilder MapShopAuthEndpoints(this RouteGroupBuilder group)
    {
        var auth = group.MapGroup("/shop/auth");

        auth.MapPost("/register", async (ShopRegisterRequest req, HttpContext http, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha, CustomersDbContext db, BrandedEmailSender emailSender, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Problem("Captcha.Failed", "Verificación anti-bots fallida.", 400);
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                return Problem("ShopAuth.WeakPassword", "La contraseña debe tener al menos 8 caracteres.", 400);
            var tid = tenant.TenantId.Value;
            var email = ShopAuth.NormalizeEmail(req.Email);
            var taken = await db.Customers.AnyAsync(c => c.TenantId == tid && c.Email == email && c.PasswordHash != null, ct);
            if (taken) return Problem("ShopAuth.EmailTaken", "Ya existe una cuenta con ese email.", 409);

            var created = Customer.CreateShopper(tid, req.Name, email ?? req.Email);
            if (created.IsFailure) return created.Error.ToProblem();
            var customer = created.Value;
            customer.SetPasswordHash(ShopAuth.HashPassword(customer, req.Password));
            db.Customers.Add(customer);
            var token = IssueSession(db, customer.Id, tid);
            var verifyTok = ShopAuth.NewToken();
            db.CustomerTokens.Add(CustomerToken.Issue(tid, customer.Id, CustomerToken.PurposeVerify, verifyTok, TimeSpan.FromDays(3)));
            await db.SaveChangesAsync(ct);
            ShopAuth.SetSessionCookie(http, tid, token);
            await emailSender.SendAsync(tid, customer.Email!, "Verificá tu email",
                EmailBody("Verificá tu email", "Confirmá tu dirección para activar tu cuenta.",
                    BuildLink(http, cfg, "/cuenta/verificar", verifyTok), "Verificar email"), ct);
            return Results.Ok(new { customer = ToDto(customer) });
        }).RequireRateLimiting("auth");

        // ¿Olvidaste tu contraseña? Manda email con link de reset. Respuesta uniforme
        // (204) exista o no el email → no permite enumerar cuentas.
        auth.MapPost("/forgot", async (ShopForgotRequest req, HttpContext http, ITenantContext tenant, CustomersDbContext db, BrandedEmailSender email, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var addr = ShopAuth.NormalizeEmail(req.Email);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Email == addr && c.PasswordHash != null, ct);
            if (customer is not null)
            {
                var tok = ShopAuth.NewToken();
                db.CustomerTokens.Add(CustomerToken.Issue(tid, customer.Id, CustomerToken.PurposeReset, tok, TimeSpan.FromHours(1)));
                await db.SaveChangesAsync(ct);
                await email.SendAsync(tid, customer.Email!, "Restablecé tu contraseña",
                    EmailBody("Restablecé tu contraseña", "Pediste cambiar tu contraseña. El link vence en 1 hora. Si no fuiste vos, ignorá este email.",
                        BuildLink(http, cfg, "/cuenta/reset", tok), "Cambiar contraseña"), ct);
            }
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        // Aplica el reset: valida el token, setea la nueva contraseña y loguea.
        auth.MapPost("/reset", async (ShopResetRequest req, HttpContext http, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                return Problem("ShopAuth.WeakPassword", "La contraseña debe tener al menos 8 caracteres.", 400);
            var tid = tenant.TenantId.Value;
            var row = await db.CustomerTokens.FirstOrDefaultAsync(t => t.Token == req.Token && t.TenantId == tid, ct);
            if (row is null || !row.IsValid(CustomerToken.PurposeReset))
                return Problem("ShopAuth.InvalidToken", "El link no es válido o expiró. Pedí uno nuevo.", 400);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == row.CustomerId, ct);
            if (customer is null) return Problem("ShopAuth.InvalidToken", "El link no es válido.", 400);

            customer.SetPasswordHash(ShopAuth.HashPassword(customer, req.Password));
            customer.MarkEmailVerified(); // resetear prueba acceso al email
            row.Consume();
            var session = IssueSession(db, customer.Id, tid);
            await db.SaveChangesAsync(ct);
            ShopAuth.SetSessionCookie(http, tid, session);
            return Results.Ok(new { customer = ToDto(customer) });
        }).RequireRateLimiting("auth");

        // Verifica el email con el token enviado al registrarse.
        auth.MapPost("/verify", async (ShopVerifyRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var row = await db.CustomerTokens.FirstOrDefaultAsync(t => t.Token == req.Token && t.TenantId == tid, ct);
            if (row is null || !row.IsValid(CustomerToken.PurposeVerify))
                return Problem("ShopAuth.InvalidToken", "El link no es válido o expiró.", 400);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == row.CustomerId, ct);
            if (customer is null) return Problem("ShopAuth.InvalidToken", "El link no es válido.", 400);
            customer.MarkEmailVerified();
            row.Consume();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        auth.MapPost("/login", async (ShopLoginRequest req, HttpContext http, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Problem("Captcha.Failed", "Verificación anti-bots fallida.", 400);
            var tid = tenant.TenantId.Value;
            var email = ShopAuth.NormalizeEmail(req.Email);
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Email == email, ct);
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
            // State FIRMADO y con expiración (antes era base64 plano, tamperable y sin
            // vencimiento): evita que se forjen/reutilicen callbacks de OAuth.
            var state = GoogleStateProtector(dp).Protect($"{tid}|{@return ?? string.Empty}", TimeSpan.FromMinutes(15));
            var url = "https://accounts.google.com/o/oauth2/v2/auth?" +
                $"client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                "&response_type=code&scope=openid%20email%20profile&access_type=online&prompt=select_account" +
                $"&state={Uri.EscapeDataString(state)}";
            return Results.Redirect(url);
        });

        auth.MapGet("/google/callback", async (string? code, string? state, IConfiguration cfg, IHttpClientFactory httpFactory, IDataProtectionProvider dp, CustomersDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var clientId = cfg["Authentication:Google:ClientId"];
            var clientSecret = cfg["Authentication:Google:ClientSecret"];
            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
                return Problem("ShopAuth.GoogleNotConfigured", "Login con Google no está configurado.", 501);
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Problem("ShopAuth.GoogleError", "Faltan parámetros del callback.", 400);

            string tenantPart, returnUrl;
            try
            {
                var decoded = GoogleStateProtector(dp).Unprotect(state).Split('|', 2);
                tenantPart = decoded[0];
                returnUrl = decoded.Length > 1 ? decoded[1] : string.Empty;
            }
            catch { return Problem("ShopAuth.GoogleError", "State inválido o vencido.", 400); }
            if (!Guid.TryParse(tenantPart, out var tid)) return Problem("ShopAuth.GoogleError", "Tenant inválido.", 400);

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
            Google.Apis.Auth.GoogleJsonWebSignature.Payload gp;
            try
            {
                gp = await Google.Apis.Auth.GoogleJsonWebSignature.ValidateAsync(idToken,
                    new Google.Apis.Auth.GoogleJsonWebSignature.ValidationSettings { Audience = new[] { clientId } });
            }
            catch
            {
                return Problem("ShopAuth.GoogleError", "id_token inválido.", 502);
            }
            var sub = gp.Subject;
            var email = ShopAuth.NormalizeEmail(gp.Email);
            var name = string.IsNullOrWhiteSpace(gp.Name) ? email : gp.Name;
            if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(email) || !gp.EmailVerified)
                return Problem("ShopAuth.GoogleError", "Google no devolvió un email verificado.", 502);

            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Email == email, ct);
            if (customer is null)
            {
                var created = Customer.CreateShopper(tid, name, email, emailVerified: true);
                if (created.IsFailure) return created.Error.ToProblem();
                customer = created.Value;
                customer.LinkGoogle(sub);
                db.Customers.Add(customer);
            }
            else
            {
                customer.LinkGoogle(sub);
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

    /// <summary>Link a la tienda usando el Origin del request (validado). Vacío si no es propio.</summary>
    private static string BuildLink(HttpContext http, IConfiguration cfg, string path, string token)
    {
        var origin = http.Request.Headers.Origin.ToString();
        var baseUrl = IsSafeReturnUrl(origin, cfg) ? origin.TrimEnd('/') : string.Empty;
        return $"{baseUrl}{path}?token={Uri.EscapeDataString(token)}";
    }

    private static string EmailBody(string title, string text, string url, string cta) => $"""
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px">{title}</h2>
          <p style="color:#444;line-height:1.5">{text}</p>
          <p style="margin:24px 0">
            <a href="{url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">{cta}</a>
          </p>
          <p style="color:#888;font-size:12px;word-break:break-all">O copiá este link: {url}</p>
        </div>
        """;

    internal static object ToDto(Customer c) => new { id = c.Id, name = c.Name, email = c.Email };
}
