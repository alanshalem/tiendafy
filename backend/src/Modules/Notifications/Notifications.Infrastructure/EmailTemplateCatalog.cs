namespace Notifications.Infrastructure;

/// <summary>Definición por defecto de una plantilla (metadata UI + contenido base).</summary>
public sealed record EmailTemplateDef(
    string Type, string Group, string Label, string Description,
    bool DefaultEnabled, string DefaultSubject, string DefaultBody);

/// <summary>
/// Catálogo de emails automáticos. Es la fuente de defaults; el tenant solo
/// guarda los que edita (overrides en la tabla email_templates).
/// Variables disponibles: {{store}}, {{name}}, {{order_id}} (el número de pedido, sin #), {{total}}, {{items}}, {{tracking_link}} ("Seguí tu pedido"), {{link}}.
/// </summary>
public static class EmailTemplateCatalog
{
    // Solo el contenido: el layout maestro brandeado (logo + color de la tienda
    // + footer) lo aplica BrandedEmailSender al enviar.
    private static string Wrap(string title, string inner) =>
        $@"<h2 style=""margin:0 0 12px;font-size:20px"">{title}</h2>
{inner}";

    public static readonly IReadOnlyList<EmailTemplateDef> All =
    [
        new("carritos-abandonados", "Promociones", "Carritos abandonados",
            "Recordá una compra no finalizada a tus clientes.", false,
            "¿Te olvidaste algo en {{store}}?",
            Wrap("Tu carrito te espera", "<p>Hola, dejaste productos en tu carrito. ¡Terminá tu compra cuando quieras!</p><p><a href=\"{{link}}\">Volver al carrito</a></p>")),

        // Favoritos: el comprador ya dijo que lo quiere. Estos dos avisos son la
        // diferencia entre un corazón guardado en la base y una venta.
        new("favorito-baja-precio", "Promociones", "Bajó un favorito",
            "Avisa a quien marcó un producto como favorito cuando baja de precio.", false,
            "Bajó de precio: {{product}}",
            Wrap("Bajó lo que estabas mirando 👀",
                "<p>Hola {{name}}, <strong>{{product}}</strong> ahora cuesta {{price}} en {{store}}.</p><p><a href=\"{{link}}\">Verlo en la tienda</a></p>")),

        new("favorito-repuesto", "Promociones", "Volvió un favorito",
            "Avisa a quien marcó un producto como favorito cuando vuelve a haber stock.", false,
            "Volvió: {{product}}",
            Wrap("Volvió lo que esperabas 🎉",
                "<p>Hola {{name}}, <strong>{{product}}</strong> vuelve a estar disponible en {{store}} a {{price}}.</p><p><a href=\"{{link}}\">Comprarlo ahora</a></p>")),

        // Lo pidió el comprador con "Avisame cuando ingrese": por eso sale
        // encendido (no es promoción, es la respuesta a un pedido).
        new("aviso-stock", "Promociones", "Avisame cuando ingrese",
            "Avisa a quien dejó su email en un producto agotado cuando vuelve a haber stock.", true,
            "Ya ingresó: {{product}}",
            Wrap("¡Ya ingresó lo que esperabas! 🎉",
                "<p>Hola, <strong>{{product}}</strong> vuelve a estar disponible en {{store}} a {{price}}.</p><p>Si todavía lo querés, ahora es el momento.</p><p><a href=\"{{link}}\">Comprarlo ahora</a></p>")),

        new("activacion-cuenta", "Cuenta de usuarios", "Activación de cuenta",
            "Ayuda al cliente a confirmar su cuenta.", true,
            "Confirmá tu cuenta en {{store}}",
            Wrap("Confirmá tu cuenta", "<p>Hola {{name}}, confirmá tu email para activar tu cuenta:</p><p><a href=\"{{link}}\">Activar cuenta</a></p>")),

        new("cambio-contrasena", "Cuenta de usuarios", "Cambio de contraseña",
            "Ayuda al usuario a recuperar su acceso.", true,
            "Restablecé tu contraseña",
            Wrap("Restablecer contraseña", "<p>Hola {{name}}, pediste cambiar tu contraseña. Si no fuiste vos, ignorá este email.</p><p><a href=\"{{link}}\">Cambiar contraseña</a></p>")),

        new("bienvenida", "Cuenta de usuarios", "Bienvenida",
            "Confirma que la cuenta fue creada con éxito.", true,
            "¡Bienvenido a {{store}}!",
            Wrap("¡Bienvenido!", "<p>Hola {{name}}, tu cuenta ya está lista. ¡Gracias por sumarte!</p>")),

        new("confirmacion-compra", "Ventas", "Confirmación de compra",
            "Confirma el pedido apenas se realiza la compra.", true,
            "Recibimos tu pedido #{{order_id}}",
            Wrap("¡Gracias por tu compra!", "<p>Tu pedido #{{order_id}} fue registrado.</p>{{items}}<p><strong>Total: {{total}}</strong></p><p><a href=\"{{tracking_link}}\">Seguí tu pedido</a></p>")),

        new("confirmacion-pago", "Ventas", "Confirmación de pago",
            "Confirma cuando el pago fue acreditado.", true,
            "Confirmamos tu pago — pedido #{{order_id}}",
            Wrap("¡Pago aprobado! 🎉", "<p>Recibimos tu pago. Estamos preparando tu pedido #{{order_id}}.</p>{{items}}<p><strong>Total: {{total}}</strong></p><p><a href=\"{{tracking_link}}\">Seguí tu pedido</a></p>")),

        // Encendida por defecto: en un pedido de retiro reemplaza a la confirmación de envío.
        new("lista-para-retirar", "Ventas", "Lista para retirar",
            "Avisa a tu cliente que su pedido de retiro en el local está listo.", true,
            "Tu pedido #{{order_id}} está listo para retirar",
            Wrap("Listo para retirar", "<p>Tu pedido #{{order_id}} ya está listo. Pasá a retirarlo cuando quieras.</p>{{items}}<p><a href=\"{{tracking_link}}\">Ver tu pedido</a></p>")),

        new("confirmacion-envio", "Ventas", "Confirmación de envío",
            "Notifica a tu cliente cuando el pedido fue despachado.", true,
            "Despachamos tu pedido #{{order_id}}",
            Wrap("¡Tu pedido está en camino!", "<p>Despachamos tu pedido #{{order_id}}. Pronto lo vas a recibir.</p><p><a href=\"{{tracking_link}}\">Seguí tu envío</a></p>")),

        // Encendido de fábrica (se apaga desde Reseñas o desde acá): las
        // reseñas casi nunca llegan solas. Sale unos días después del despacho.
        new("pedir-resena", "Ventas", "Pedido de reseña",
            "Le pide al comprador que opine de lo que compró, unos días después del despacho.", true,
            "¿Qué te pareció tu compra en {{store}}?",
            Wrap("¿Nos contás qué te pareció?",
                "<p>Hola {{name}}, esperamos que estés disfrutando tu compra.</p>{{items}}<p>Tu opinión ayuda a otros compradores a decidir (y a nosotros a mejorar). Te lleva un minuto:</p><p><a href=\"{{link}}\">Dejar mi reseña</a></p>")),

        new("cancelacion-compra", "Ventas", "Cancelación de compra",
            "Notifica cuando un pedido fue cancelado.", false,
            "Tu pedido #{{order_id}} fue cancelado",
            Wrap("Pedido cancelado", "<p>Tu pedido fue cancelado. Si tenés dudas, escribinos.</p>")),

        new("factura", "Ventas", "Factura",
            "Informa al cliente al facturar una venta.", false,
            "Tu factura de {{store}}",
            Wrap("Tu factura", "<p>Adjuntamos la factura de tu compra #{{order_id}}.</p>")),
    ];

    public static EmailTemplateDef? Find(string type) => All.FirstOrDefault(t => t.Type == type);
}
