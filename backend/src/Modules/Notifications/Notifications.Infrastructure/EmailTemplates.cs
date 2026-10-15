using System.Net;
using Microsoft.EntityFrameworkCore;

namespace Notifications.Infrastructure;

public sealed record RenderedEmail(bool Enabled, string Subject, string Html);

/// <summary>Resuelve la plantilla de un tenant (override o default) y sustituye variables.</summary>
public interface IEmailTemplates
{
    Task<RenderedEmail?> RenderAsync(Guid tenantId, string type, IReadOnlyDictionary<string, string> vars, CancellationToken ct = default);
}

public sealed class EmailTemplates(NotificationsDbContext db) : IEmailTemplates
{
    public async Task<RenderedEmail?> RenderAsync(Guid tenantId, string type, IReadOnlyDictionary<string, string> vars, CancellationToken ct = default)
    {
        var def = EmailTemplateCatalog.Find(type);
        if (def is null) return null;

        var ovr = await db.EmailTemplates.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.Type == type, ct);

        var enabled = def.IsEnabled(ovr?.Enabled);
        var subject = string.IsNullOrWhiteSpace(ovr?.Subject) ? def.DefaultSubject : ovr!.Subject;
        var body = string.IsNullOrWhiteSpace(ovr?.BodyHtml) ? def.DefaultBody : ovr!.BodyHtml;

        // Las variables vienen HTML-encodeadas (van al cuerpo). El asunto es
        // texto plano: sin decodificar, "Café" llegaba como "Caf&#233;".
        return new RenderedEmail(enabled, WebUtility.HtmlDecode(Substitute(subject, vars)), Substitute(body, vars));
    }

    /// <summary>Reemplazo de placeholders {{var}}; compartido con el preview del editor.</summary>
    public static string Substitute(string template, IReadOnlyDictionary<string, string> vars)
    {
        foreach (var (key, value) in vars)
            template = template.Replace("{{" + key + "}}", value);
        return template;
    }
}
