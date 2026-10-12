using Api.Auth;
using Api.Notifications;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// WhatsApp automático (Cloud API de Meta): conexión por tienda + mensajes
/// habilitables por tipo, espejo de los e-mails automáticos. El contenido de
/// las plantillas lo aprueba Meta; acá se referencian por nombre.
/// </summary>
public static class WhatsAppEndpoints
{
    public static RouteGroupBuilder MapWhatsAppEndpoints(this RouteGroupBuilder group)
    {
        var wa = group.MapGroup("/whatsapp").RequirePermission(Permission.NotificationsConfig);

        // Estado de la conexión (nunca devuelve el token).
        wa.MapGet("/connection", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var c = await db.WhatsAppConnections.AsNoTracking()
                .FirstOrDefaultAsync(x => x.TenantId == tenant.TenantId.Value, ct);
            return Results.Ok(new
            {
                connected = c is not null,
                phoneNumberId = c?.PhoneNumberId,
                displayPhoneNumber = c?.DisplayPhoneNumber,
                connectedAtUtc = c?.ConnectedAtUtc,
            });
        });

        // Conectar / actualizar credenciales de la Cloud API.
        wa.MapPut("/connection", async (
            WhatsAppConnectRequest req, ITenantContext tenant, NotificationsDbContext db,
            WhatsAppTokenProtector protector, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.PhoneNumberId) || string.IsNullOrWhiteSpace(req.AccessToken))
                return Results.Problem(title: "WhatsApp.MissingCredentials",
                    detail: "Faltan el Phone Number ID o el access token.", statusCode: 400);

            var tid = tenant.TenantId.Value;
            var encrypted = protector.Protect(req.AccessToken.Trim());
            var existing = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tid, ct);
            if (existing is null)
                db.WhatsAppConnections.Add(WhatsAppConnection.Create(tid, req.PhoneNumberId, encrypted, req.DisplayPhoneNumber));
            else
                existing.Update(req.PhoneNumberId, encrypted, req.DisplayPhoneNumber);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        wa.MapDelete("/connection", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            await db.WhatsAppConnections
                .Where(x => x.TenantId == tenant.TenantId.Value)
                .ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });

        // Mensaje de prueba: valida credenciales end-to-end con la plantilla
        // hello_world que Meta trae pre-aprobada en toda cuenta nueva.
        wa.MapPost("/test", async (
            WhatsAppTestRequest req, ITenantContext tenant, NotificationsDbContext db,
            WhatsAppTokenProtector protector, WhatsAppSender sender, CancellationToken ct) =>
        {
            var to = WhatsAppSender.NormalizeArPhone(req.To);
            if (to is null)
                return Results.Problem(title: "WhatsApp.BadPhone",
                    detail: "Ingresá un número argentino válido (ej: 11 2345-6789).", statusCode: 400);

            var conn = await db.WhatsAppConnections.AsNoTracking()
                .FirstOrDefaultAsync(x => x.TenantId == tenant.TenantId.Value, ct);
            if (conn is null)
                return Results.Problem(title: "WhatsApp.NotConnected",
                    detail: "Conectá WhatsApp antes de probar.", statusCode: 409);

            var ok = await sender.SendTemplateAsync(
                conn.PhoneNumberId, protector.Unprotect(conn.AccessTokenEncrypted),
                to, "hello_world", "en_US", [], ct);
            return ok
                ? Results.Ok(new { sent = true, to })
                : Results.Problem(title: "WhatsApp.SendFailed",
                    detail: "Meta rechazó el envío. Revisá el token, el Phone Number ID y que el número destino esté habilitado (en modo prueba solo llegan a números registrados como testers).", statusCode: 502);
        });

        // Catálogo + overrides del tenant (misma forma que /email-templates).
        wa.MapGet("/templates", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var overrides = await db.WhatsAppTemplates.AsNoTracking()
                .Where(x => x.TenantId == tid).ToDictionaryAsync(x => x.Type, ct);

            var items = WhatsAppTemplateCatalog.All.Select(def =>
            {
                overrides.TryGetValue(def.Type, out var o);
                return new
                {
                    type = def.Type,
                    group = def.Group,
                    label = def.Label,
                    description = def.Description,
                    enabled = o?.Enabled ?? false,
                    metaTemplateName = o?.MetaTemplateName ?? def.SuggestedMetaName,
                    languageCode = o?.LanguageCode ?? "es_AR",
                    variables = def.Variables,
                    sampleBody = def.SampleBody,
                };
            });
            return Results.Ok(new { items });
        });

        wa.MapPut("/templates/{type}", async (
            string type, WhatsAppTemplateRequest req, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var def = WhatsAppTemplateCatalog.Find(type);
            if (def is null) return Results.NotFound();

            var tid = tenant.TenantId.Value;
            var name = string.IsNullOrWhiteSpace(req.MetaTemplateName) ? def.SuggestedMetaName : req.MetaTemplateName!.Trim();
            var lang = string.IsNullOrWhiteSpace(req.LanguageCode) ? "es_AR" : req.LanguageCode!.Trim();

            var row = await db.WhatsAppTemplates.FirstOrDefaultAsync(x => x.TenantId == tid && x.Type == def.Type, ct);
            if (row is null)
                db.WhatsAppTemplates.Add(WhatsAppTemplate.Create(tid, def.Type, req.Enabled, name, lang));
            else
                row.Update(req.Enabled, name, lang);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { type = def.Type, enabled = req.Enabled, metaTemplateName = name, languageCode = lang });
        });

        return group;
    }
}

public sealed record WhatsAppConnectRequest(string? PhoneNumberId, string? AccessToken, string? DisplayPhoneNumber);
public sealed record WhatsAppTestRequest(string? To);
public sealed record WhatsAppTemplateRequest(bool Enabled, string? MetaTemplateName, string? LanguageCode);
