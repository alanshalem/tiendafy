using System.Net;
using Notifications.Infrastructure;

namespace Api.Notifications;

/// <summary>
/// Los emails de seguridad de la cuenta del comprador (verificar el email al
/// registrarse, link para cambiar la contraseña) con la plantilla editable de
/// la tienda. Antes salían con un texto fijo desde ShopAuthEndpoints y editar
/// la plantilla en el panel no cambiaba nada.
///
/// <para>
/// Son <see cref="EmailTemplateDef.AlwaysOn"/>: salen siempre, la tienda solo
/// cambia el texto. Y como sin el link el email no sirve, si la tienda lo
/// borró del cuerpo se agrega el botón al final.
/// </para>
/// </summary>
public sealed class ShopperAccountEmails(IEmailTemplates templates, BrandedEmailSender email, StoreLinks links)
{
    public const string Activation = "activacion-cuenta";
    public const string PasswordReset = "cambio-contrasena";
    public const string RegistrationAttempt = "intento-registro";
    public const string NewsletterConfirm = "confirmar-suscripcion";

    /// <summary>Email para verificar la dirección de una cuenta recién creada.</summary>
    public Task SendActivationAsync(Guid tenantId, string to, string? name, string link, CancellationToken ct) =>
        SendAsync(tenantId, to, Activation, name, link, "Activar mi cuenta", ct);

    /// <summary>Email con el link (de un solo uso) para elegir una contraseña nueva.</summary>
    public Task SendPasswordResetAsync(Guid tenantId, string to, string? name, string link, CancellationToken ct) =>
        SendAsync(tenantId, to, PasswordReset, name, link, "Cambiar contraseña", ct);

    /// <summary>
    /// Al dueño de una cuenta: alguien intentó registrarse con su email. El
    /// registro le contesta a quien lo intentó lo mismo que a una cuenta nueva.
    /// </summary>
    public Task SendRegistrationAttemptAsync(Guid tenantId, string to, string? name, string link, CancellationToken ct) =>
        SendAsync(tenantId, to, RegistrationAttempt, name, link, "Ir a mi cuenta", ct);

    /// <summary>Doble confirmación del newsletter: el link (de un solo uso) que deja la suscripción confirmada.</summary>
    public Task SendNewsletterConfirmAsync(Guid tenantId, string to, string link, CancellationToken ct) =>
        SendAsync(tenantId, to, NewsletterConfirm, name: null, link, "Confirmar suscripción", ct);

    private async Task SendAsync(
        Guid tenantId, string to, string template, string? name, string link, string ctaLabel, CancellationToken ct)
    {
        var store = await links.ForTenantAsync(tenantId, "https", ct);
        var safeLink = WebUtility.HtmlEncode(link);
        var vars = new Dictionary<string, string>
        {
            ["store"] = WebUtility.HtmlEncode(store?.Name ?? "la tienda"),
            ["name"] = WebUtility.HtmlEncode(name ?? string.Empty),
            ["link"] = safeLink,
        };

        // Las claves están en el catálogo y son AlwaysOn: siempre hay
        // render y siempre está prendido. El default es solo red de seguridad.
        var rendered = await templates.RenderAsync(tenantId, template, vars, ct);
        var def = EmailTemplateCatalog.Find(template);
        var subject = rendered?.Subject ?? EmailTemplates.Substitute(def?.DefaultSubject ?? ctaLabel, vars);
        var html = rendered?.Html ?? EmailTemplates.Substitute(def?.DefaultBody ?? string.Empty, vars);

        if (!html.Contains(safeLink, StringComparison.Ordinal))
            html += EmailTemplates.Substitute(EmailTemplateCatalog.Cta(ctaLabel), vars);

        // Best-effort, como antes: un error de Resend no rompe el registro ni el "olvidé mi contraseña".
        await email.SendAsync(tenantId, to, subject, html, ct, template);
    }
}
