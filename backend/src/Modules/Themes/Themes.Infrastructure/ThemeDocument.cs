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

    public DateTime UpdatedAtUtc { get; set; }

    public static ThemeDocument CreateDefault(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        PublishedConfig = DefaultConfig,
        DraftConfig = DefaultConfig,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>
    /// Config por defecto de una tienda nueva. Espeja `baseTheme` de shared/types
    /// (+ las secciones iniciales sembradas) — si se agrega un campo al schema del
    /// tema, agregarlo también acá para que una tienda recién creada no sirva una
    /// config incompleta (normalizeTheme lo rellena al leer, pero mejor no depender).
    /// </summary>
    public const string DefaultConfig = """
    {
      "logo": "",
      "favicon": "",
      "shareImage": "",
      "seoTitle": "",
      "seoDescription": "",
      "borderRadius": "rounded",
      "motion": "subtle",
      "density": "cozy",
      "iconKit": "lucide",
      "colors": { "primary": "232 80 30", "accent": "27 21 16", "useAccent": false, "bg": "255 255 255", "text": "17 24 39" },
      "fonts": { "heading": "sans", "body": "sans" },
      "header": { "bg": "27 21 16", "sticky": true, "logoSize": "md", "showTabsMobile": true, "layout": "classic", "textColor": "", "transparentOnHome": false, "transparentLevel": "full", "showSearch": false, "showCart": true, "cartStyle": "icon", "border": "none", "menu": [] },
      "announcement": { "show": false, "animation": "static", "items": [] },
      "comingSoon": { "enabled": false, "collectEmails": false, "title": "Estamos en construcción", "message": "Volvemos muy pronto con la tienda. ¡Gracias por tu paciencia!" },
      "sections": [
        { "id": "carousel", "type": "carousel", "visible": true, "data": { "images": [], "fullHeightMobile": false } },
        { "id": "featured", "type": "featured", "visible": true, "data": { "title": "Destacados", "carousel": true } },
        { "id": "promo-banners", "type": "promo-banners", "visible": false, "data": { "fullWidth": false, "banners": [] } },
        { "id": "institutional", "type": "institutional", "visible": false, "data": { "title": "", "description": "" } },
        { "id": "image-text", "type": "image-text", "visible": false, "data": { "image": "", "title": "", "description": "", "buttonText": "", "link": "" } },
        { "id": "info-bar", "type": "info-bar", "visible": true, "data": {} },
        { "id": "newsletter", "type": "newsletter", "visible": false, "data": { "title": "Recibí novedades", "text": "" } }
      ],
      "productList": { "columns": 4, "showPrice": true, "showBuyButton": true, "showCompareAt": true, "filterCategories": true, "filterPrice": true, "filterBrand": true, "filterOptions": true, "showCashPrice": false, "installmentsCount": 0, "showStockBadge": false, "defaultSort": "newest", "pageSize": 24, "imageRatio": "square", "cardStyle": "plain" },
      "productDetail": { "installmentsCount": 0, "showPaymentLogos": false, "askWhatsApp": false, "showSku": false, "showStock": true, "galleryStyle": "thumbs", "showRelated": true, "cashDiscountPercent": 0 },
      "cart": { "showCoupon": true, "showContinue": true, "freeShippingBar": false, "freeShippingThreshold": 5000000, "checkoutButtonText": "Iniciar compra", "showSuggested": true, "notice": "" },
      "contact": { "showForm": true, "address": "", "phone": "", "email": "", "whatsapp": "" },
      "footer": { "text": "", "showSocial": true, "instagram": "", "facebook": "", "tiktok": "", "youtube": "", "x": "", "showPages": false, "showNewsletter": false, "newsletterTitle": "Recibí novedades y ofertas", "showPaymentLogos": true, "paymentLogos": ["mercadopago", "visa", "mastercard"], "whatsapps": [], "addresses": [], "phones": [], "emails": [] },
      "whatsappButton": { "enabled": false, "phone": "", "message": "¡Hola! Tengo una consulta.", "showPreview": true },
      "customCss": ""
    }
    """;
}
