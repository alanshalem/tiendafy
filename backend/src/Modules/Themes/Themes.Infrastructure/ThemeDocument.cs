namespace Themes.Infrastructure;

/// <summary>
/// Configuración de diseño de la tienda: un documento por tenant.
/// Modelo draft/published: el editor trabaja sobre el draft (preview en vivo
/// vía postMessage), "Publicar" copia draft → published. El storefront lee
/// published. La config es un blob JSON rico (colores, fuentes, encabezado,
/// barra de anuncio, secciones ordenadas con su contenido) — el backend no
/// necesita entender el schema, solo guardarlo/servirlo.
/// </summary>
public sealed class ThemeDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    /// <summary>Config publicada (la que ve el comprador). JSON.</summary>
    public string PublishedConfig { get; set; } = DefaultConfig;

    /// <summary>Borrador del editor (preview, todavía no publicado). JSON.</summary>
    public string DraftConfig { get; set; } = DefaultConfig;

    // Columnas legacy (v1) — se mantienen para no romper la migración previa.
    public string Announcement { get; set; } = string.Empty;
    public string TokensJson { get; set; } = "{}";
    public string SectionsJson { get; set; } = "[]";

    public DateTime UpdatedAtUtc { get; set; }

    public static ThemeDocument CreateDefault(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        PublishedConfig = DefaultConfig,
        DraftConfig = DefaultConfig,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>Config por defecto de una tienda nueva. Espeja el default del storefront.</summary>
    public const string DefaultConfig = """
    {
      "logo": "",
      "favicon": "",
      "shareImage": "",
      "colors": { "primary": "232 80 30", "accent": "27 21 16", "useAccent": false, "bg": "255 255 255", "text": "17 24 39" },
      "fonts": { "heading": "sans", "body": "sans" },
      "header": { "bg": "27 21 16", "sticky": true, "logoSize": "md", "showTabsMobile": true, "layout": "classic", "textColor": "", "transparentOnHome": false, "showSearch": false, "showCart": true, "cartStyle": "icon", "showAccount": false, "border": "none" },
      "announcement": { "show": false, "message": "", "link": "" },
      "sections": [
        { "id": "carousel", "type": "carousel", "visible": true, "data": { "images": [], "fullHeightMobile": false } },
        { "id": "featured", "type": "featured", "visible": true, "data": { "title": "Destacados", "carousel": true } },
        { "id": "promo-banners", "type": "promo-banners", "visible": false, "data": { "fullWidth": false, "banners": [] } },
        { "id": "institutional", "type": "institutional", "visible": false, "data": { "title": "", "description": "" } },
        { "id": "image-text", "type": "image-text", "visible": false, "data": { "image": "", "title": "", "description": "", "buttonText": "", "link": "" } },
        { "id": "info-bar", "type": "info-bar", "visible": true, "data": {} },
        { "id": "newsletter", "type": "newsletter", "visible": false, "data": { "title": "Recibí novedades", "text": "" } }
      ],
      "productList": { "columns": 4, "showPrice": true, "showBuyButton": true, "showCompareAt": true },
      "productDetail": { "showSku": false, "showStock": true, "galleryStyle": "thumbs", "showRelated": true },
      "cart": { "freeShippingBar": false, "freeShippingThreshold": 5000000, "checkoutButtonText": "Iniciar compra", "showSuggested": true },
      "contact": { "showForm": true, "address": "", "phone": "", "email": "", "whatsapp": "" },
      "footer": { "text": "", "showSocial": true, "instagram": "", "facebook": "", "showPaymentLogos": true, "whatsapps": [], "addresses": [], "phones": [], "emails": [] },
      "customCss": ""
    }
    """;
}
