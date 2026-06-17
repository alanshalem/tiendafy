namespace Notifications.Infrastructure;

/// <summary>Definición por defecto de una plantilla (metadata UI + contenido base).</summary>
public sealed record EmailTemplateDef(
    string Type, string Group, string Label, string Description,
    bool DefaultEnabled, string DefaultSubject, string DefaultBody);

/// <summary>
/// Catálogo de emails automáticos. Es la fuente de defaults; el tenant solo
/// guarda los que edita (overrides en la tabla email_templates).
/// Variables disponibles: {{store}}, {{name}}, {{order_id}}, {{total}}, {{items}}, {{link}}.
/// </summary>
public static class EmailTemplateCatalog
{
    private static string Wrap(string title, string inner) =>
        $@"<div style=""font-family:sans-serif;max-width:520px;margin:auto;color:#222"">
  <h2 style=""color:#e8501e"">{title}</h2>
  {inner}
  <p style=""color:#999;font-size:12px;margin-top:24px"">{{{{store}}}}</p>
</div>";

    public static readonly IReadOnlyList<EmailTemplateDef> All =
    [
        new("carritos-abandonados", "Promociones", "Carritos abandonados",
            "Recordá una compra no finalizada a tus clientes.", false,
            "¿Te olvidaste algo en {{store}}?",
            Wrap("Tu carrito te espera", "<p>Hola, dejaste productos en tu carrito. ¡Terminá tu compra cuando quieras!</p><p><a href=\"{{link}}\">Volver al carrito</a></p>")),

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
            Wrap("¡Gracias por tu compra!", "<p>Tu pedido fue registrado.</p>{{items}}<p><strong>Total: {{total}}</strong></p>")),

        new("confirmacion-pago", "Ventas", "Confirmación de pago",
            "Confirma cuando el pago fue acreditado.", true,
            "Confirmamos tu pago — pedido #{{order_id}}",
            Wrap("¡Pago aprobado! 🎉", "<p>Recibimos tu pago. Estamos preparando tu pedido.</p>{{items}}<p><strong>Total: {{total}}</strong></p>")),

        new("lista-para-retirar", "Ventas", "Lista para retirar",
            "Avisa a tu cliente que su pedido está listo.", false,
            "Tu pedido #{{order_id}} está listo para retirar",
            Wrap("Listo para retirar", "<p>Tu pedido ya está listo. Pasá a retirarlo cuando quieras.</p>")),

        new("confirmacion-envio", "Ventas", "Confirmación de envío",
            "Notifica a tu cliente cuando el pedido fue despachado.", true,
            "Despachamos tu pedido #{{order_id}}",
            Wrap("¡Tu pedido está en camino!", "<p>Despachamos tu pedido. Pronto lo vas a recibir.</p>")),

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
