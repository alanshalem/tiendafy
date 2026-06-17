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

        var enabled = ovr?.Enabled ?? def.DefaultEnabled;
        var subject = string.IsNullOrWhiteSpace(ovr?.Subject) ? def.DefaultSubject : ovr!.Subject;
        var body = string.IsNullOrWhiteSpace(ovr?.BodyHtml) ? def.DefaultBody : ovr!.BodyHtml;

        return new RenderedEmail(enabled, Substitute(subject, vars), Substitute(body, vars));
    }

    private static string Substitute(string template, IReadOnlyDictionary<string, string> vars)
    {
        foreach (var (key, value) in vars)
            template = template.Replace("{{" + key + "}}", value);
        return template;
    }
}
