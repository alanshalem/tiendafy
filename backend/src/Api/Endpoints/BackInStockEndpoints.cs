using Api.Auth;
using Api.Notifications;
using Catalog.Contracts;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// "Avisame cuando ingrese": la suscripción desde la ficha de un producto
/// agotado, la baja desde el email y la demanda que ve la tienda en el panel.
/// El aviso en sí lo manda <see cref="BackInStockWorker"/>.
/// </summary>
public static class BackInStockEndpoints
{
    public static RouteGroupBuilder MapBackInStockEndpoints(this RouteGroupBuilder group)
    {
        // Sin RequireTenant a nivel grupo: la baja llega desde un email, sin
        // header de tienda (el token firmado dice cuál es).
        var alerts = group.MapGroup("/back-in-stock");

        alerts.MapPost("/", async (
            BackInStockRequest req, ITenantContext tenant, Api.Captcha.ICaptchaVerifier captcha,
            ICatalogCheckoutQuery catalog, IStockRepository stock, CustomersDbContext db, CancellationToken ct) =>
        {
            // Trampa para bots (campo oculto), como el newsletter: OK sin hacer nada.
            if (!string.IsNullOrWhiteSpace(req.Website)) return Results.Ok(new { ok = true });
            // Y el captcha: cada aviso termina en un email a la dirección que se cargó.
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Api.Captcha.CaptchaProblem.Failed();

            var email = (req.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (email.Length is < 5 or > 200 || !email.Contains('@') || email.Contains(' '))
                return Error.Validation("StockAlert.InvalidEmail", "Revisá el email.").ToProblem();

            var tid = tenant.TenantId.Value;
            var found = await catalog.GetVariantsAsync(tid, [req.VariantId], ct);
            if (found is not [var variant, ..] || !variant.ProductIsActive)
                return Error.NotFound("StockAlert.VariantNotFound", "Ese producto ya no está a la venta.").ToProblem();

            // Solo tiene sentido en lo agotado: si hay, que lo compre.
            var rows = await stock.GetByVariantsAsync(tenant.TenantId, [req.VariantId], ct);
            var available = rows is [var row, ..] ? row.Sellable : 0;
            if (available is null or > 0)
                return Error.Conflict("StockAlert.InStock", "¡Ya hay stock! Podés comprarlo ahora.").ToProblem();

            var pending = db.StockAlerts.Where(s => s.TenantId == tid && s.Email == email
                && s.NotifiedAtUtc == null && s.CancelledAtUtc == null);
            if (await pending.AnyAsync(s => s.VariantId == req.VariantId, ct))
                return Results.Ok(new { ok = true }); // ya estaba anotado: es lo que pedía
            if (await pending.CountAsync(ct) >= StockAlertSubscription.MaxPendingPerEmail)
                return Error.Conflict("StockAlert.TooMany",
                    "Ya tenés muchos avisos pendientes en esta tienda. Te escribimos cuando ingresen.").ToProblem();

            db.StockAlerts.Add(StockAlertSubscription.Create(tid, variant.ProductId, req.VariantId, email));
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Dos envíos a la vez chocan contra el índice único: ya está anotado.
            }
            return Results.Ok(new { ok = true });
        }).RequireTenant().RequireRateLimiting("auth");

        // Baja desde el link del email: cancela TODOS los avisos pendientes de
        // ese email en la tienda (quien no quiere más mails no quiere elegir de a uno).
        alerts.MapGet("/unsubscribe", (string? token, IDataProtectionProvider dp) =>
        {
            var payload = token is null ? null : BackInStockUnsubscribeToken.Unprotect(dp, token);
            if (payload is null)
                return Results.Content(PublicPage.Render("Link inválido",
                    "<p>El link de baja no es válido o está incompleto.</p>"), "text/html");
            return Results.Content(PublicPage.Render("Dejar de esperar avisos", $"""
                <p>¿Querés que dejemos de avisarte cuando ingresen los productos que esperabas en esta tienda?</p>
                <form method="post" action="/api/v1/back-in-stock/unsubscribe?token={Uri.EscapeDataString(token!)}">
                  <button type="submit" style="background:#18181b;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer">Sí, no me avisen más</button>
                </form>
                """), "text/html");
        });

        alerts.MapPost("/unsubscribe", async (
            string? token, IDataProtectionProvider dp, CustomersDbContext db, CancellationToken ct) =>
        {
            var payload = token is null ? null : BackInStockUnsubscribeToken.Unprotect(dp, token);
            if (payload is null)
                return Results.Content(PublicPage.Render("Link inválido",
                    "<p>El link de baja no es válido o está incompleto.</p>"), "text/html");

            var now = DateTime.UtcNow;
            await db.StockAlerts.IgnoreQueryFilters()
                .Where(s => s.TenantId == payload.TenantId && s.Email == payload.Email
                    && s.NotifiedAtUtc == null && s.CancelledAtUtc == null)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.CancelledAtUtc, now), ct);
            return Results.Content(PublicPage.Render("Listo",
                "<p>No te vamos a avisar más cuando ingresen esos productos.</p>"), "text/html");
        });

        // ------------------------------------------------- la demanda (panel)
        var admin = group.MapGroup("/admin/back-in-stock").RequireTenant().RequirePermission(Permission.InventoryRead);

        // Qué está esperando la gente, de lo más pedido a lo menos: es la lista
        // de compras que la tienda no sabía que tenía.
        admin.MapGet("/", async (
            ITenantContext tenant, CustomersDbContext db, ICatalogCheckoutQuery catalog,
            IStockRepository stock, CancellationToken ct, int? offset = null, int? limit = null) =>
        {
            var tid = tenant.TenantId.Value;
            var rows = await db.StockAlerts.AsNoTracking()
                .Where(s => s.TenantId == tid && s.NotifiedAtUtc == null && s.CancelledAtUtc == null)
                .GroupBy(s => new { s.ProductId, s.VariantId })
                .Select(g => new { g.Key.ProductId, g.Key.VariantId, Waiting = g.Count(), Since = g.Min(s => s.CreatedAtUtc) })
                .OrderByDescending(g => g.Waiting)
                .ThenBy(g => g.Since)
                .ThenBy(g => g.VariantId)
                .ToListAsync(ct);

            var (skip, take) = Paging.Window(offset, limit, defaultLimit: 25, maxLimit: 100);
            var page = rows.Skip(skip).Take(take).ToList();
            var variantIds = page.Select(r => r.VariantId).ToList();
            var variants = (await catalog.GetVariantsAsync(tid, variantIds, ct)).ToDictionary(v => v.VariantId);
            var available = (await stock.GetByVariantsAsync(tenant.TenantId, variantIds, ct))
                .ToDictionary(s => s.VariantId, s => s.Sellable);

            return Results.Ok(new
            {
                items = page.Select(r =>
                {
                    variants.TryGetValue(r.VariantId, out var v);
                    return new
                    {
                        productId = r.ProductId,
                        variantId = r.VariantId,
                        productName = v?.ProductName ?? "Producto borrado",
                        variantLabel = v?.VariantDescription,
                        sku = v?.Sku,
                        waiting = r.Waiting,
                        sinceUtc = r.Since,
                        available = available.GetValueOrDefault(r.VariantId),
                    };
                }),
                total = rows.Count,
                totalWaiting = rows.Sum(r => r.Waiting),
            });
        });

        // Lo que espera UN producto (la ficha del producto en el panel).
        admin.MapGet("/products/{productId:guid}", async (
            Guid productId, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var variants = await db.StockAlerts.AsNoTracking()
                .Where(s => s.TenantId == tid && s.ProductId == productId && s.NotifiedAtUtc == null && s.CancelledAtUtc == null)
                .GroupBy(s => s.VariantId)
                .Select(g => new { variantId = g.Key, waiting = g.Count() })
                .ToListAsync(ct);
            var notified = await db.StockAlerts.AsNoTracking()
                .CountAsync(s => s.TenantId == tid && s.ProductId == productId && s.NotifiedAtUtc != null, ct);
            return Results.Ok(new { waiting = variants.Sum(v => v.waiting), notified, variants });
        });

        return group;
    }
}

public sealed record BackInStockRequest(Guid VariantId, string? Email, string? Website = null, string? Captcha = null);

/// <summary>Baja de los avisos de stock: la tienda y el email, firmados.</summary>
public sealed record BackInStockUnsubscribePayload(Guid TenantId, string Email);

/// <summary>
/// Token del link de baja de "Avisame cuando ingrese". Sin vencimiento, como
/// el de las campañas: un link de baja tiene que andar aunque el email quede
/// meses en la bandeja.
/// </summary>
public static class BackInStockUnsubscribeToken
{
    // Sin vencimiento, y el purpose no se toca: ver SignedToken.
    private static readonly SignedToken<BackInStockUnsubscribePayload> Token = new("Tiendafy.StockAlerts.Unsubscribe.v1");

    public static string Protect(IDataProtectionProvider dp, Guid tenantId, string email) =>
        Token.Protect(dp, new BackInStockUnsubscribePayload(tenantId, email.Trim().ToLowerInvariant()));

    public static BackInStockUnsubscribePayload? Unprotect(IDataProtectionProvider dp, string token) =>
        Token.Unprotect(dp, token, p => p.TenantId != Guid.Empty && !string.IsNullOrEmpty(p.Email));
}
