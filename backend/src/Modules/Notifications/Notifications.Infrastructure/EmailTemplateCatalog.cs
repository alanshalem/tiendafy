namespace Notifications.Infrastructure;

/// <summary>Definición por defecto de una plantilla (metadata UI + contenido base).</summary>
/// <param name="AlwaysOn">
/// Email de seguridad (verificar la cuenta, cambiar la contraseña): sale
/// siempre. La tienda solo puede cambiarle el texto; el panel no muestra el
/// interruptor y un "apagado" guardado no cuenta.
/// </param>
public sealed record EmailTemplateDef(
    string Type, string Group, string Label, string Description,
    bool DefaultEnabled, string DefaultSubject, string DefaultBody, bool AlwaysOn = false)
{
    /// <summary>Si sale, según lo que guardó la tienda (null = nunca la tocó).</summary>
    public bool IsEnabled(bool? saved) => AlwaysOn || (saved ?? DefaultEnabled);
}

/// <summary>
/// Catálogo de emails automáticos. Es la fuente de defaults; el tenant solo
/// guarda los que edita (overrides en la tabla email_templates).
/// Variables disponibles: {{store}}, {{name}}, {{order_id}} (el número de pedido, sin #), {{total}}, {{items}}, {{tracking_link}} ("Seguí tu pedido"), {{link}}
/// y, en las instrucciones de pago, {{payment_instructions}}; en el reembolso parcial, {{refund_amount}} y {{refund_method}}.
/// <para>
/// Una plantilla está acá solo si algo la manda. "Confirmación de compra" y
/// "Bienvenida" se sacaron (oct-2026): no había evento propio (la compra ya
/// avisa con "Instrucciones de pago" o "Confirmación de pago"; el registro,
/// con "Activación de cuenta") y prenderlas habría mandado un segundo email.
/// Las filas que alguna tienda guardó de esas claves quedan en la tabla sin
/// uso: el panel lista el catálogo, no la tabla.
/// </para>
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
        // Encendida de fábrica: el worker la mandaba siempre (con un texto fijo)
        // antes de que la plantilla existiera de verdad, y apagarla de golpe
        // habría cortado un email que todas las tiendas ya mandaban.
        // {{items}} es la lista de lo que quedó en el carrito.
        new("carritos-abandonados", "Promociones", "Carritos abandonados",
            "Recordá una compra no finalizada a tus clientes.", true,
            "¿Te quedó algo en el carrito de {{store}}?",
            Wrap("Tu carrito te espera", "<p>Dejaste cosas en tu carrito de {{store}}. Todavía estás a tiempo de completar tu compra.</p>{{items}}<p><a href=\"{{link}}\">Volver a la tienda</a></p>")),

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

        // Emails de seguridad del login de la tienda: salen siempre (AlwaysOn).
        // Sin el de activación nadie verifica su email; sin el de cambio de
        // contraseña, quien la olvidó pierde la cuenta. {{link}} es el link
        // con el token; si la tienda lo borra del texto, se agrega al final.
        new("activacion-cuenta", "Cuenta de usuarios", "Activación de cuenta",
            "Le pide al cliente que confirme su email al crear la cuenta. Sale siempre.", true,
            "Verificá tu email",
            Wrap("Verificá tu email", "<p>Hola {{name}}, confirmá tu dirección para activar tu cuenta.</p>" + Cta("Verificar email")),
            AlwaysOn: true),

        new("cambio-contrasena", "Cuenta de usuarios", "Cambio de contraseña",
            "Le manda el link para elegir una contraseña nueva a quien la olvidó. Sale siempre.", true,
            "Restablecé tu contraseña",
            Wrap("Restablecé tu contraseña", "<p>Hola {{name}}, pediste cambiar tu contraseña. El link vence en 1 hora. Si no fuiste vos, ignorá este email.</p>" + Cta("Cambiar contraseña")),
            AlwaysOn: true),

        // Encendida por defecto: sin este email el que eligió transferencia no
        // tiene adónde mirar los datos de la cuenta si cierra la pestaña.
        new("instrucciones-pago", "Ventas", "Instrucciones de pago",
            "Le manda a quien eligió transferencia o efectivo cuánto pagar, a qué cuenta y hasta cuándo.", true,
            "Cómo pagar tu pedido #{{order_id}}",
            Wrap("¡Recibimos tu pedido!", "<p>Hola {{name}}, te guardamos los productos. Para terminar la compra, pagá {{total}} así:</p>{{payment_instructions}}{{items}}")),

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

        // Apagada de fábrica, pero la cancelación a mano, la que se cancela sola
        // por vencer el plazo de una transferencia y el reembolso total avisan
        // igual (con este texto o con uno propio de cada caso): el comprador
        // tiene que enterarse. Prenderla es para usar el texto propio.
        new("cancelacion-compra", "Ventas", "Cancelación de compra",
            "Avisa cuando un pedido se cancela o se reembolsa entero.", false,
            "Tu pedido #{{order_id}} fue cancelado",
            Wrap("Pedido cancelado", "<p>Tu pedido fue cancelado. Si tenés dudas, escribinos.</p>")),

        // Mismo criterio que la de cancelación: sale siempre (apagada, con este
        // texto de fábrica). Una plantilla aparte y no variables en la de
        // cancelación: el texto de un reembolso parcial dice otra cosa (la
        // compra sigue en pie) y cada tienda edita uno sin romper el otro.
        // {{refund_amount}}: lo devuelto en ESTE reembolso; {{refund_method}}:
        // por dónde vuelve la plata, en una frase.
        new("reembolso-parcial", "Ventas", "Reembolso parcial",
            "Avisa cuánto le devolviste al comprador y por dónde cuando reembolsás una parte de la compra.", false,
            "Te devolvimos {{refund_amount}} de tu pedido #{{order_id}}",
            Wrap("Te devolvimos parte de tu compra",
                "<p>Hola {{name}}, te devolvimos {{refund_amount}} de tu pedido #{{order_id}}.</p><p>{{refund_method}}</p><p><a href=\"{{tracking_link}}\">Ver tu pedido</a></p>")),

        new("factura", "Ventas", "Factura",
            "Le manda al cliente la factura de su compra, con el PDF. En homologación (facturación de prueba) no sale.", false,
            "Tu factura de {{store}}",
            Wrap("Tu factura", "<p>Adjuntamos la factura de tu compra #{{order_id}}.</p>")),

        // Una por cada nota de crédito de la venta (un reembolso, un ajuste),
        // con su PDF: el comprobante que anula en todo o en parte la factura.
        new("nota-credito", "Ventas", "Nota de crédito",
            "Le manda al cliente cada nota de crédito de su compra (por un reembolso o un ajuste), con el PDF. En homologación (facturación de prueba) no sale.", false,
            "Tu nota de crédito de {{store}}",
            Wrap("Tu nota de crédito", "<p>Adjuntamos la nota de crédito de tu compra #{{order_id}}: es el comprobante de lo que te devolvimos o ajustamos.</p>")),
    ];

    public static EmailTemplateDef? Find(string type) => All.FirstOrDefault(t => t.Type == type);

    /// <summary>Botón al {{link}} y el link en texto, para quien no puede tocar el botón.</summary>
    public static string Cta(string label) =>
        $@"<p style=""margin:24px 0""><a href=""{{{{link}}}}"" style=""background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block"">{label}</a></p>
<p style=""color:#888;font-size:12px;word-break:break-all"">O copiá este link: {{{{link}}}}</p>";
}
