using System.Text;
using System.Text.Json;
using Api.Shop;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>Auth de comprador del storefront: email/password + Google OAuth. Tenant por header.</summary>
public static class ShopAuthEndpoints
{
    public static RouteGroupBuilder MapShopAuthEndpoints(this RouteGroupBuilder group)
    {
        var auth = group.MapGroup("/shop/auth");

        auth.MapPost("/register", async (ShopRegisterRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                return Problem("ShopAuth.WeakPassword", "La contraseña debe tener al menos 8 caracteres.", 400);
            var tid = tenant.TenantId.Value;
            var email = req.Email?.Trim().ToLowerInvariant();
            var taken = await db.Customers.AnyAsync(c => c.TenantId == tid && c.Email == email && c.PasswordHash != null, ct);
            if (taken) return Problem("ShopAuth.EmailTaken", "Ya existe una cuenta con ese email.", 409);

            var created = Customer.CreateShopper(tid, req.Name, req.Email);
            if (created.IsFailure) return created.Error.ToProblem();
            var customer = created.Value;
            customer.SetPasswordHash(ShopAuth.HashPassword(customer, req.Password));
            db.Customers.Add(customer);
            var token = await IssueSessionAsync(db, customer.Id, tid, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { token, customer = ToDto(customer) });
        });

        auth.MapPost("/login", async (ShopLoginRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            var tid = tenant.TenantId.Value;
            var email = req.Email?.Trim().ToLowerInvariant();
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Email == email, ct);
            if (customer is null || !ShopAuth.VerifyPassword(customer, req.Password ?? string.Empty))
                return Problem("ShopAuth.InvalidCredentials", "Email o contraseña incorrectos.", 401);
            var token = await IssueSessionAsync(db, customer.Id, tid, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { token, customer = ToDto(customer) });
        });

        auth.MapPost("/logout", async (HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var header = http.Request.Headers.Authorization.ToString();
            if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = header["Bearer ".Length..].Trim();
                await db.CustomerSessions.Where(s => s.Token == token).ExecuteDeleteAsync(ct);
            }
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
        auth.MapGet("/google/start", (IConfiguration cfg, HttpContext http, string tenant, string? @return) =>
        {
            if (!Guid.TryParse(tenant, out var tid)) return Problem("ShopAuth.BadTenant", "Tenant inválido.", 400);
            var clientId = cfg["Authentication:Google:ClientId"];
            if (string.IsNullOrEmpty(clientId))
                return Problem("ShopAuth.GoogleNotConfigured", "Login con Google no está configurado en el servidor.", 501);
            var redirectUri = $"{http.Request.Scheme}://{http.Request.Host}/api/v1/shop/auth/google/callback";
            var state = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{tid}|{@return ?? string.Empty}"));
            var url = "https://accounts.google.com/o/oauth2/v2/auth?" +
                $"client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                "&response_type=code&scope=openid%20email%20profile&access_type=online&prompt=select_account" +
                $"&state={Uri.EscapeDataString(state)}";
            return Results.Redirect(url);
        });

        auth.MapGet("/google/callback", async (string? code, string? state, IConfiguration cfg, IHttpClientFactory httpFactory, CustomersDbContext db, HttpContext http, CancellationToken ct) =>
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
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(state)).Split('|', 2);
                tenantPart = decoded[0];
                returnUrl = decoded.Length > 1 ? decoded[1] : string.Empty;
            }
            catch { return Problem("ShopAuth.GoogleError", "State inválido.", 400); }
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

            // Payload del id_token: viene directo de Google sobre TLS (token endpoint) → no verificamos firma local.
            var parts = idToken.Split('.');
            if (parts.Length < 2) return Problem("ShopAuth.GoogleError", "id_token mal formado.", 502);
            using var payload = JsonDocument.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[1])));
            var sub = payload.RootElement.GetProperty("sub").GetString();
            var email = payload.RootElement.TryGetProperty("email", out var em) ? em.GetString()?.ToLowerInvariant() : null;
            var name = payload.RootElement.TryGetProperty("name", out var nm) ? nm.GetString() : email;
            if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(email))
                return Problem("ShopAuth.GoogleError", "Google no devolvió email.", 502);

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
            var token = await IssueSessionAsync(db, customer.Id, tid, ct);
            await db.SaveChangesAsync(ct);

            // Token en el fragmento (#): no viaja al server, lo lee el storefront en el cliente.
            var dest = string.IsNullOrEmpty(returnUrl) ? "/" : returnUrl;
            var sep = dest.Contains('#') ? "&" : "#";
            return Results.Redirect($"{dest}{sep}shop_token={Uri.EscapeDataString(token)}");
        });

        return group;
    }

    private static async Task<string> IssueSessionAsync(CustomersDbContext db, Guid customerId, Guid tid, CancellationToken ct)
    {
        var token = ShopAuth.NewToken();
        db.CustomerSessions.Add(CustomerSession.Issue(customerId, tid, token, ShopAuth.SessionLifetime));
        await Task.CompletedTask;
        return token;
    }

    private static byte[] Base64UrlDecode(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4) { case 2: s += "=="; break; case 3: s += "="; break; }
        return Convert.FromBase64String(s);
    }

    private static IResult MissingTenant() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });
    private static IResult Problem(string title, string detail, int status) => Results.Problem(title: title, detail: detail, statusCode: status);

    internal static object ToDto(Customer c) => new { id = c.Id, name = c.Name, email = c.Email };
}
