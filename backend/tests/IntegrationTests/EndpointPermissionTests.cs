using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Ninguna funcionalidad del panel puede quedar fuera de la matriz de permisos.
///
/// Recorre TODOS los endpoints de la API: cada uno tiene que exigir un permiso
/// del catálogo, o estar en la lista de abajo con el motivo por el que no lo
/// necesita (la tienda pública, el comprador, el login, los webhooks). Sin
/// este test, alcanza con olvidarse un `RequirePermission` para que cualquier
/// persona del equipo, de cualquier rol, pueda usar esa funcionalidad.
/// </summary>
[Collection("api")]
public sealed class EndpointPermissionTests(ApiFactory factory)
{
    /// <summary>Lo que a propósito no exige un permiso de la matriz, agrupado por motivo.</summary>
    private static readonly Dictionary<string, string[]> SinPermisoAProposito = new()
    {
        ["La tienda pública: lo ve cualquier visitante"] =
        [
            "GET /api/v1/captcha/config",
            "GET /api/v1/checkout-settings",
            "GET /api/v1/store-offers", // descuento por transferencia, cuotas y envío gratis que anuncia la tienda
            "GET /api/v1/redirects/resolve",
            "GET /api/v1/spec-definitions/", // los nombres de la ficha técnica que muestra cada producto
            "GET /api/v1/shipping/correo/agencies",
            "GET /api/v1/shipping/methods",
            "GET /api/v1/tracking/",
            "GET /api/v1/tenants/resolve",
            "GET /api/v1/payments/mercadopago/public-config",
            "GET /api/v1/payments/payway/public-config",
            "POST /api/v1/contact/submit",
            "POST /api/v1/coupons/validate",
            "POST /api/v1/newsletter/",
            "POST /api/v1/newsletter/confirm", // el link del mail de "Confirmá tu suscripción" (doble confirmación)
            "POST /api/v1/shipping/andreani/quote",
            "POST /api/v1/shipping/correo/quote",
            "POST /api/v1/shipping/zipnova/quote",
            "POST /api/v1/track",
            "GET /api/v1/search/popular", // "Búsquedas populares" del buscador de la tienda
            "POST /api/v1/search/log", // una búsqueda hecha en la tienda (lo encontrado lo cuenta el servidor)
            "GET /api/v1/store/legal", // razón social, CUIT, Data Fiscal y la leyenda de precios: obligatorios a la vista
            "POST /api/v1/shop/track-order", // "Seguí tu pedido": email + número o link firmado, con límite de intentos
        ],
        ["El checkout del comprador (la sesión es el id del checkout)"] =
        [
            "GET /api/v1/checkout/{id:guid}",
            "POST /api/v1/checkout/",
            "POST /api/v1/checkout/contact",
            "POST /api/v1/checkout/{id:guid}/pay",
            "POST /api/v1/checkout/{id:guid}/pay-onsite",
            "POST /api/v1/checkout/{id:guid}/pay-payway",
            "POST /api/v1/checkout/{id:guid}/pay-offline",
            "POST /api/v1/checkout/{id:guid}/submit",
            "GET /api/v1/payments/mercadopago/callback",
        ],
        ["La cuenta del comprador (sesión propia de la tienda, no del panel)"] =
        [
            "GET /api/v1/shop/auth/google/callback",
            "GET /api/v1/shop/auth/google/configured",
            "GET /api/v1/shop/auth/google/start",
            "GET /api/v1/shop/auth/me",
            "POST /api/v1/shop/auth/forgot",
            "POST /api/v1/shop/auth/login",
            "POST /api/v1/shop/auth/logout",
            "POST /api/v1/shop/auth/register",
            "POST /api/v1/shop/auth/reset",
            "POST /api/v1/shop/auth/verify",
            "POST /api/v1/shop/auth/verify/resend",
            "POST /api/v1/shop/favorites/merge",
            "PUT /api/v1/shop/favorites/{productId:guid}",
            "DELETE /api/v1/shop/favorites/{productId:guid}",
            "GET /api/v1/shop/orders",
            "GET /api/v1/shop/orders/{id:guid}",
            "GET /api/v1/shop/orders/{id:guid}/invoice.pdf",
            "GET /api/v1/shop/addresses/",
            "POST /api/v1/shop/addresses/",
            "PUT /api/v1/shop/addresses/{id:guid}",
            "POST /api/v1/shop/addresses/{id:guid}/default",
            "DELETE /api/v1/shop/addresses/{id:guid}",
            "GET /api/v1/shop/support/conversations",
            "GET /api/v1/shop/support/conversations/{id:guid}/messages",
            "POST /api/v1/shop/support/conversations",
            "POST /api/v1/shop/support/conversations/{id:guid}/attachments",
            "POST /api/v1/shop/support/conversations/{id:guid}/messages",
        ],
        ["Una venta: la ve el comprador que la hizo o alguien del equipo con 'Ver las ventas' (se decide adentro)"] =
        [
            "GET /api/v1/orders/{id:guid}",
            "GET /api/v1/orders/{id:guid}/status",
            "GET /api/v1/orders/{id:guid}/summary", // la página de gracias: sin teléfono ni DNI
        ],
        ["Entrar al panel: login, registro y la propia cuenta"] =
        [
            "GET /api/v1/auth/me",
            "GET /api/v1/auth/registration-open",
            "POST /api/v1/auth/forgot",
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/login/2fa", // el segundo paso: vale solo con la cookie intermedia de la contraseña
            "POST /api/v1/auth/logout",
            "POST /api/v1/auth/register",
            "POST /api/v1/auth/resend-verification",
            "POST /api/v1/auth/reset",
            "POST /api/v1/auth/verify",
            "GET /api/v1/me/permissions",
            // La verificación en dos pasos es de cada persona, no de una tienda.
            "GET /api/v1/auth/2fa/",
            "POST /api/v1/auth/2fa/setup",
            "POST /api/v1/auth/2fa/enable",
            "POST /api/v1/auth/2fa/disable",
            "POST /api/v1/auth/2fa/recovery-codes",
            "POST /api/v1/auth/2fa/relink", // pasarla a otra app (teléfono nuevo)
            "POST /api/v1/auth/2fa/relink/confirm",
        ],
        ["Las tiendas de cada uno: la plataforma, no una tienda (editar y borrar piden 'tenant.admin' adentro; la facturación de cada una, 'stats.read')"] =
        [
            "GET /api/v1/tenants/",
            "GET /api/v1/tenants/{id:guid}",
            "GET /api/v1/tenants/check",
            "GET /api/v1/tenants/overview",
            "POST /api/v1/tenants/",
            "PATCH /api/v1/tenants/{id:guid}",
            "POST /api/v1/tenants/{id:guid}/archive",
            "POST /api/v1/tenants/{id:guid}/activate",
            "DELETE /api/v1/tenants/{id:guid}",
            "DELETE /api/v1/tenants/{id:guid}/purge",
        ],
        ["Configuración de la plataforma: exige sesión de superadministrador (IsSuperAdmin) adentro del grupo"] =
        [
            "GET /api/v1/admin/platform-settings/",
            "PUT /api/v1/admin/platform-settings/",
        ],
        ["Webhooks y vueltas de OAuth: los llama el proveedor (se validan con firma o state)"] =
        [
            "POST /api/v1/payments/webhooks/mercadopago",
            "POST /api/v1/webhooks/meli",
            "POST /api/v1/webhooks/resend",
            "GET /api/v1/meli/oauth/callback",
            "GET /api/v1/meta-ads/oauth/callback",
            "GET /api/v1/social/oauth/callback/{connector}",
        ],
        ["Links de los emails de campañas (firmados)"] =
        [
            "GET /api/v1/marketing/c",
            "GET /api/v1/marketing/o.gif",
            "GET /api/v1/marketing/unsubscribe",
            "POST /api/v1/marketing/unsubscribe",
        ],
        ["Reseñas: las lee cualquiera; se escriben solo con el link firmado de una venta despachada; votos y denuncias con límite por IP"] =
        [
            "GET /api/v1/reviews/products/{productId:guid}",
            "GET /api/v1/reviews/invite",
            "POST /api/v1/reviews/",
            "POST /api/v1/reviews/photos",
            "POST /api/v1/reviews/{id:guid}/helpful",
            "POST /api/v1/reviews/{id:guid}/report",
            "GET /api/v1/shop/orders/{orderId:guid}/review-invite",
        ],
        ["\"Avisame cuando ingrese\": la suscripción desde la tienda y la baja desde el email (firmada)"] =
        [
            "POST /api/v1/back-in-stock/",
            "GET /api/v1/back-in-stock/unsubscribe",
            "POST /api/v1/back-in-stock/unsubscribe",
        ],
        ["Solo dice qué funciones de IA puede usar quien pregunta (el permiso se cruza adentro, por tarea)"] =
        [
            "GET /api/v1/ai/status",
        ],
    };

    /// <summary>Cada endpoint de /api/v1 con su método y si declara un permiso de la matriz.</summary>
    private List<(string Key, bool Declared)> Endpoints() =>
        [.. factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText?.StartsWith("/api/v1", StringComparison.Ordinal) == true)
            .SelectMany(e => (e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["*"]).Select(method =>
            {
                // Con un permiso declarado alcanza: las lecturas de un grupo "solo
                // escrituras" son del storefront a propósito (productos, categorías,
                // tema publicado) y su permiso dice quién las escribe.
                var declared = e.Metadata.GetOrderedMetadata<PermissionMetadata>().Count > 0;
                return ($"{method} {e.RoutePattern.RawText}", declared);
            }))];

    [Fact]
    public void Cada_endpoint_exige_un_permiso_o_esta_en_la_lista_con_su_motivo()
    {
        var allowed = SinPermisoAProposito.Values.SelectMany(v => v).ToHashSet();
        var missing = Endpoints().Where(e => !e.Declared && !allowed.Contains(e.Key)).Select(e => e.Key).Order().ToList();
        Assert.True(missing.Count == 0,
            "Endpoints sin permiso de la matriz (agregar RequirePermission, o a la lista con su motivo):\n"
            + string.Join("\n", missing));
    }

    [Fact]
    public void La_lista_no_tiene_entradas_viejas()
    {
        var all = Endpoints().ToDictionary(e => e.Key, e => e.Declared);
        var stale = SinPermisoAProposito.Values.SelectMany(v => v)
            .Where(k => !all.TryGetValue(k, out var declared) || declared)
            .Order().ToList();
        Assert.True(stale.Count == 0,
            "Entradas que ya no existen o que ahora sí piden permiso (sacarlas de la lista):\n" + string.Join("\n", stale));
    }

    [Fact]
    public void Cada_permiso_del_catalogo_protege_algo()
    {
        // Un permiso que ningún endpoint pide es un tilde en la matriz que no
        // cambia nada: o sobra, o le falta el RequirePermission a su funcionalidad.
        var used = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .SelectMany(e => e.Metadata.GetOrderedMetadata<PermissionMetadata>())
            .SelectMany(p => p.AnyOf)
            .ToHashSet();
        var unused = Enum.GetValues<Permission>().Where(p => !used.Contains(p)).ToList();
        Assert.True(unused.Count == 0, "Permisos que no protegen ningún endpoint: " + string.Join(", ", unused));
    }
}
