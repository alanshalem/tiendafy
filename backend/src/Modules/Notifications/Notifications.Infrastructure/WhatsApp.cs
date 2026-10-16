namespace Notifications.Infrastructure;

/// <summary>
/// Conexión de la tienda con WhatsApp Cloud API (Meta). Una por tenant.
/// El access token se guarda cifrado (DataProtection, igual que MercadoPago).
/// </summary>
public sealed class WhatsAppConnection
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    /// <summary>Phone Number ID de la Cloud API (no es el número de teléfono).</summary>
    public string PhoneNumberId { get; private set; } = null!;
    public string AccessTokenEncrypted { get; private set; } = null!;
    /// <summary>Número visible, informativo (ej: +54 9 11 1234-5678).</summary>
    public string? DisplayPhoneNumber { get; private set; }
    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private WhatsAppConnection() { } // EF Core

    public static WhatsAppConnection Create(Guid tenantId, string phoneNumberId, string accessTokenEncrypted, string? displayPhone)
    {
        var now = DateTime.UtcNow;
        return new WhatsAppConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PhoneNumberId = phoneNumberId.Trim(),
            AccessTokenEncrypted = accessTokenEncrypted,
            DisplayPhoneNumber = displayPhone?.Trim(),
            ConnectedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public void Update(string phoneNumberId, string accessTokenEncrypted, string? displayPhone)
    {
        PhoneNumberId = phoneNumberId.Trim();
        AccessTokenEncrypted = accessTokenEncrypted;
        DisplayPhoneNumber = displayPhone?.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>
/// Override por tenant de un mensaje automático de WhatsApp: activado o no, y
/// el nombre/idioma de la plantilla APROBADA por Meta que se usa al enviar.
/// El contenido vive en el Meta Business Manager (Meta lo aprueba); acá solo
/// se referencia.
/// </summary>
public sealed class WhatsAppTemplate
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Type { get; private set; } = null!;
    public bool Enabled { get; private set; }
    /// <summary>Nombre exacto de la plantilla aprobada en Meta (ej: confirmacion_compra).</summary>
    public string MetaTemplateName { get; private set; } = null!;
    /// <summary>Código de idioma de la plantilla (ej: es_AR).</summary>
    public string LanguageCode { get; private set; } = "es_AR";
    public DateTime UpdatedAtUtc { get; private set; }

    private WhatsAppTemplate() { } // EF Core

    public static WhatsAppTemplate Create(Guid tenantId, string type, bool enabled, string metaTemplateName, string languageCode) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Type = type,
        Enabled = enabled,
        MetaTemplateName = metaTemplateName.Trim(),
        LanguageCode = string.IsNullOrWhiteSpace(languageCode) ? "es_AR" : languageCode.Trim(),
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Update(bool enabled, string metaTemplateName, string languageCode)
    {
        Enabled = enabled;
        MetaTemplateName = metaTemplateName.Trim();
        LanguageCode = string.IsNullOrWhiteSpace(languageCode) ? "es_AR" : languageCode.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

public sealed record WhatsAppTemplateDef(
    string Type,
    string Group,
    string Label,
    string Description,
    bool DefaultEnabled,
    /// <summary>Nombre sugerido para crear la plantilla en Meta.</summary>
    string SuggestedMetaName,
    /// <summary>Variables que se envían, EN ORDEN, como {{1}}, {{2}}… de la plantilla.</summary>
    string[] Variables,
    /// <summary>Texto de ejemplo del cuerpo, para guiar al merchant al crearla en Meta.</summary>
    string SampleBody);

/// <summary>
/// Catálogo de mensajes automáticos de WhatsApp. Espejo de los emails
/// transaccionales de ventas (los de cuenta no van por WhatsApp).
/// </summary>
public static class WhatsAppTemplateCatalog
{
    public static readonly IReadOnlyList<WhatsAppTemplateDef> All =
    [
        // Sale cuando la venta queda pagada, igual que "Confirmación de pago":
        // con las dos prendidas, el comprador recibe dos mensajes.
        new("confirmacion-compra", "Ventas", "Confirmación de compra",
            "Avisa que recibiste el pedido, cuando queda pagado. Sale junto con «Confirmación de pago»: prendé una de las dos.",
            DefaultEnabled: false, "confirmacion_compra",
            ["nombre", "orden", "total"],
            "¡Hola {{1}}! Recibimos tu pedido {{2}} por {{3}}. Te avisamos apenas salga. 🙌"),

        new("confirmacion-pago", "Ventas", "Confirmación de pago",
            "Avisa cuando el pago fue acreditado.",
            DefaultEnabled: false, "confirmacion_pago",
            ["nombre", "orden", "total"],
            "¡Hola {{1}}! Tu pago del pedido {{2}} por {{3}} fue acreditado. Ya lo estamos preparando. ✅"),

        new("confirmacion-envio", "Ventas", "Pedido en camino",
            "Avisa el despacho, con el código de seguimiento.",
            DefaultEnabled: false, "pedido_en_camino",
            ["nombre", "orden", "seguimiento"],
            "¡Hola {{1}}! Tu pedido {{2}} ya está en camino 🚚. Seguimiento: {{3}}."),

        new("lista-para-retirar", "Ventas", "Listo para retirar",
            "Avisa que el pedido está listo en el punto de retiro.",
            DefaultEnabled: false, "listo_para_retirar",
            ["nombre", "orden"],
            "¡Hola {{1}}! Tu pedido {{2}} ya está listo para retirar. Te esperamos. 🛍️"),

        // Solo el reembolso total: el texto sugerido dice que se devolvió la
        // plata, así que no sirve para una venta sin cobrar que se cancela ni
        // para un parcial (esos avisan solo por email). La clave queda igual
        // que la del email: es la que guardó cada tienda.
        new("cancelacion-compra", "Ventas", "Reembolso",
            "Avisa cuando le devolvés el total de un pedido.",
            DefaultEnabled: false, "pedido_reembolsado",
            ["nombre", "orden", "total"],
            "Hola {{1}}, procesamos el reembolso de tu pedido {{2}} por {{3}}. Cualquier duda escribinos por acá."),

        new("carritos-abandonados", "Promociones", "Carritos abandonados",
            "Recordá una compra no finalizada. Meta lo clasifica como marketing: usalo con moderación y solo con clientes que aceptaron recibir novedades.",
            DefaultEnabled: false, "carrito_abandonado",
            ["nombre", "tienda"],
            "¡Hola {{1}}! Dejaste productos en tu carrito de {{2}}. Terminá tu compra cuando quieras 😉"),
    ];

    public static WhatsAppTemplateDef? Find(string type) =>
        All.FirstOrDefault(d => string.Equals(d.Type, type, StringComparison.OrdinalIgnoreCase));
}
