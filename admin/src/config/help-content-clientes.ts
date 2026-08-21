import type { HelpArticle } from './helpContent';

export const CLIENTES = {
  clientes: {
    title: 'Clientes',
    intro: 'Conocé quiénes te compran y dales una cuenta para que vuelvan.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Cuentas de cliente',
        paragraphs: [
          'Tus compradores pueden crear una cuenta en tu tienda (email y contraseña, con verificación por email). Con cuenta ven sus pedidos, guardan favoritos y acceden al chat posventa.',
        ],
      },
      {
        heading: 'El panel de Clientes',
        paragraphs: [
          'En Clientes ves y buscás a todas las personas registradas y a quienes te escribieron. Los roles vendedor, finanzas y soporte pueden consultarlos; editar requiere administrador.',
        ],
        blocks: [{ type: 'path', segments: ['Clientes'] }],
      },
    ],
  },

  posventa: {
    title: 'Chat posventa',
    intro: 'Un chat por pedido entre tu tienda y el comprador, con fotos y archivos adjuntos.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Cómo funciona',
        paragraphs: [
          'El cliente, desde su cuenta → Mis pedidos, toca “Consultar sobre este pedido” y abre un chat ligado a esa compra. Puede escribir y adjuntar fotos (JPG/PNG) o PDF de hasta 10 MB.',
          'Vos respondés desde Chat posventa en el menú: una bandeja con todas las conversaciones, las no leídas primero y con contador.',
        ],
        blocks: [{ type: 'path', segments: ['Chat posventa'] }],
      },
      {
        heading: 'Seguridad de los archivos',
        paragraphs: [
          'Los adjuntos se guardan en almacenamiento privado: solo los ven el comprador de ese pedido y tu equipo, mediante enlaces firmados que vencen a los 15 minutos.',
        ],
      },
      {
        heading: 'Cerrar y reabrir',
        paragraphs: [
          'Cuando la consulta se resuelve, cerrá la conversación. Si el cliente vuelve a escribir, se reabre sola — no se pierde nada.',
        ],
      },
    ],
  },

  autoEmails: {
    title: 'E-mails automáticos',
    intro: 'Tu tienda manda emails transaccionales sola, con tu logo y tus colores.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Qué se envía',
        paragraphs: [
          'Confirmación de compra y de pago, pedido en camino (con seguimiento), listo para retirar, cancelación/reembolso, bienvenida y verificación de cuenta, recuperación de contraseña y carritos abandonados. Activás cada uno por separado.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'E-mails automáticos'] },
          {
            type: 'demo',
            demo: 'switch',
            caption:
              'Cada tipo de email tiene su interruptor — probalo. Apagado, ese email simplemente no se envía.',
          },
        ],
      },
      {
        heading: 'Con la estética de tu tienda',
        paragraphs: [
          'Todos los emails salen con un diseño profesional: tu logo (el del editor de tema), tu color primario, la tabla del pedido con fotos de los productos, subtotal, descuento, envío y total, y la dirección de entrega.',
          'Si todavía no subiste logo, se muestra el nombre de la tienda. Subilo en Canales de venta → Tienda online.',
        ],
      },
      {
        heading: 'Editá el contenido',
        steps: [
          'En Configuración → E-mails automáticos, tocá “Editar contenido”.',
          'Cambiá el asunto y el cuerpo con el editor. Usá variables como {{name}}, {{order_id}}, {{total}} o {{items}} — se reemplazan al enviar.',
          'La vista previa de la derecha es EXACTAMENTE lo que recibe el cliente, con tu branding y datos de ejemplo.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Variable', 'Se reemplaza por'],
            rows: [
              ['{{store}}', 'El nombre de tu tienda'],
              ['{{name}}', 'El nombre del cliente'],
              ['{{order_id}}', 'El número del pedido'],
              ['{{total}}', 'El total pagado'],
              ['{{items}}', 'La tabla de productos con fotos y precios'],
              ['{{link}}', 'El link de la acción (seguimiento, verificación, carrito…)'],
            ],
          },
        ],
      },
      {
        heading: 'Envío real',
        paragraphs: [
          'En desarrollo los emails se registran en los logs. En producción se envían por Resend con la clave que configures.',
        ],
      },
      {
        heading: '¿Quién manda los emails?',
        paragraphs: [
          'Salen todos por una misma cuenta a nivel plataforma, configurada una sola vez. No hay nada que cargar por tienda. El detalle está en el centro de ayuda, en Administrar la plataforma → Qué conseguir y dónde se carga cada cosa.',
        ],
      },
      {
        heading: 'Cuánto cuesta y cómo seguirlo',
        paragraphs: [
          'Arriba de esta pantalla, el panel “Uso del mes” te muestra cuántos emails salieron este mes, el total histórico y un costo estimado. La estimación usa una tarifa de referencia (Resend Pro ≈ US$ 0,40 cada 1.000 emails); el costo real depende del plan contratado — los primeros miles del mes suelen entrar en el plan gratuito.',
        ],
      },
    ],
  },

  emailMarketing: {
    title: 'Campañas de email',
    intro:
      'Mandá novedades y promociones masivas a tus clientes, con el diseño de tu tienda y baja automática.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Campañas vs. e-mails automáticos',
        paragraphs: [
          'Los e-mails automáticos son transaccionales: confirman compras, envíos, cuentas — se disparan solos. Las campañas son marketing: VOS decidís cuándo escribirle a tu base (“llegó la colección nueva”, “20% este finde”). Viven en Email marketing, en el menú principal.',
        ],
        blocks: [
          { type: 'path', segments: ['Email marketing'] },
          {
            type: 'demo',
            demo: 'campaignStatuses',
            caption: 'Los estados por los que pasa una campaña, tal como se ven en la lista de Marketing.',
          },
        ],
      },
      {
        heading: 'Crear y enviar una campaña',
        steps: [
          'En Marketing → Nueva campaña, escribí el asunto y el contenido. La vista previa de la derecha es EXACTAMENTE lo que recibe el cliente, con tu logo y colores.',
          'Elegí la audiencia y afinala con filtros: cuánto gastó, cuántas compras hizo, si compró hace poco o está inactivo. O elegí destinatarios uno por uno. El conteo se actualiza en vivo.',
          'Sumá productos destacados: se muestran como tarjetas con foto, precio y link a tu tienda.',
          'Asociá un cupón (opcional): después el detalle te dice cuántas ventas y cuánta plata generó la campaña.',
          'Enviate una prueba, y después Enviar ahora o Programar para una fecha y hora.',
        ],
      },
      {
        heading: 'Segmentar bien vale oro',
        paragraphs: [
          'Ejemplos que funcionan: “gastó más de $100.000” con un cupón VIP; “sin comprar hace 90 días” con un incentivo de vuelta; “compró en los últimos 30 días” para lanzamientos. Un email relevante a 200 personas rinde más que uno genérico a 2.000 — y quema menos tu lista.',
        ],
      },
      {
        heading: 'Medir lo que pasó',
        paragraphs: [
          'En el detalle de cada campaña enviada ves: enviados y fallidos, aperturas y clicks, bajas que generó, costo estimado y — si asociaste un cupón — las ventas y el dinero atribuidos a la campaña.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Métrica', 'Qué tan confiable es'],
            rows: [
              ['Enviados / fallidos', 'Exacta'],
              ['Aperturas', 'Subestimada: muchos clientes de correo bloquean imágenes'],
              ['Clicks', 'Buena'],
              ['Bajas', 'Exacta'],
              ['Ventas por cupón', 'La más confiable — decidí con esta'],
            ],
          },
        ],
      },
      {
        heading: 'La baja es automática (y obligatoria)',
        paragraphs: [
          'Cada campaña sale con un link de “Dejar de recibir novedades” al pie. Quien se da de baja entra en una lista de supresión y no recibe NUNCA más campañas tuyas — aunque siga apareciendo en la audiencia. Sus emails de compra (confirmaciones, envíos) siguen llegando: son otra categoría.',
          'Esto no es opcional: mandar marketing sin opción de baja es spam, te denuncian los proveedores de correo y arruina la entregabilidad de todos tus emails, incluidos los transaccionales.',
        ],
      },
      {
        heading: 'Buenas prácticas para no caer en spam',
        paragraphs: [
          'Mandá poco y bueno: una campaña quincenal con contenido real rinde más que tres semanales de relleno. Asuntos honestos (sin MAYÚSCULAS ni “GRATIS!!!”), siempre con tu dominio verificado en Resend, y mirá el panel de uso: cada envío cuenta para tu costo mensual.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Requisitos de plataforma en producción',
            text: 'El tracking de aperturas/clicks y los links de baja necesitan PublicApiBaseUrl configurada en el servidor, y la supresión automática de rebotes necesita el webhook de Resend. El detalle está en la sección “Para quien administra la plataforma” del artículo de E-mails automáticos.',
          },
        ],
      },
    ],
  },

  whatsappAuto: {
    title: 'WhatsApp automático',
    intro:
      'Mensajes de WhatsApp que se envían solos con la API oficial de Meta: confirmaciones, envíos y más.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Qué necesitás',
        steps: [
          'Un número de WhatsApp Business dedicado a la tienda (no puede ser tu WhatsApp personal).',
          'Una app en developers.facebook.com con el producto WhatsApp habilitado.',
          'El Phone Number ID (está en el panel de WhatsApp de tu app) y un access token permanente (se genera con un system user en Meta Business).',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'El número que conectes a la API deja de funcionar en la app de WhatsApp del teléfono. Usá un número dedicado a la tienda, nunca tu personal.',
          },
        ],
      },
      {
        heading: 'Conectar y probar',
        steps: [
          'En Configuración → WhatsApp automático, pegá el Phone Number ID y el token, y tocá Conectar.',
          'Usá “Enviar mensaje de prueba” con tu propio número para validar la conexión (en modo prueba de Meta solo llega a números registrados como testers).',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'WhatsApp automático'] }],
      },
      {
        heading: 'Las plantillas las aprueba Meta',
        paragraphs: [
          'A diferencia de los emails, el texto de cada mensaje es una plantilla que creás y Meta aprueba en el Meta Business Manager (tarda 24-48 hs). En Tiendafy activás cada tipo de mensaje y le indicás el nombre exacto de tu plantilla aprobada y su idioma.',
          'Cada tarjeta te muestra un texto sugerido para copiar al crear la plantilla en Meta, y qué variables enviamos en cada posición ({{1}}, {{2}}…).',
        ],
      },
      {
        heading: 'Qué conviene activar',
        paragraphs: [
          'Los transaccionales rinden oro: confirmación de pago, pedido en camino (con seguimiento) y listo para retirar. El de carritos abandonados es marketing para Meta: usalo con moderación y solo con clientes que marcaron “Quiero recibir novedades” — abusar degrada la calidad de tu número y Meta te limita el volumen.',
        ],
      },
      {
        heading: 'Se activa por tipo, igual que los emails',
        paragraphs: [
          'Cada tipo de mensaje tiene su interruptor por tienda. Si un mensaje no tiene plantilla configurada o está apagado, simplemente no se envía — la venta nunca se ve afectada.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'A diferencia de Mercado Pago/Libre o Resend, acá NO hay credenciales de plataforma: WhatsApp es 100% por tienda. Cada tienda crea su propia app en Meta con su propio número — nada que configurar en el servidor.',
          },
        ],
      },
      {
        heading: 'Cuánto cuesta y cómo seguirlo',
        paragraphs: [
          'Meta cobra por mensaje de plantilla entregado (en Argentina, los transaccionales rondan los US$ 0,034 por mensaje; los de marketing cuestan más). Se paga directo a Meta con la tarjeta que cargues en tu app — Tiendafy no intermedia.',
          'El panel “Uso del mes” de esta pantalla muestra cuántos mensajes salieron y el costo estimado con esa tarifa de referencia.',
        ],
      },
    ],
  },

  contact: {
    title: 'Información de contacto',
    intro: 'Mostrar tus datos de contacto en la tienda es obligatorio por ley en Argentina.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: '¿Por qué es obligatorio?',
        paragraphs: [
          'La Resolución N° 104/2005 de Defensa del Consumidor exige que tu tienda online muestre datos de contacto reales y visibles (email, dirección y teléfono).',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'No cumplir puede traerte sanciones. Cargá la información verdadera de tu negocio, no datos de relleno.',
          },
        ],
      },
      {
        heading: 'Qué cargar',
        steps: [
          'Email de la tienda (puede ser distinto al de tu login).',
          'Dirección del local o showroom.',
          'Teléfono de contacto.',
          'Un texto informativo opcional (horarios, aclaraciones).',
        ],
      },
      {
        heading: '¿Dónde aparece?',
        paragraphs: [
          'En la página de Contacto de tu tienda y en el pie de página, para que cualquier comprador pueda verlos.',
        ],
      },
    ],
  },

  whatsapp: {
    title: 'Botón de WhatsApp',
    intro: 'Mostrá un botón flotante para que tus clientes te escriban por WhatsApp con un toque.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Cargá tu número',
        paragraphs: [
          'Ingresá el número con código de país y sin el “+”. Para Argentina el formato es: 54 + 9 (celular) + característica + número.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Ejemplo',
            text: 'Para el 11 2345-6789 (CABA, celular) se carga: 5491123456789.',
          },
        ],
      },
      {
        heading: 'Activalo',
        steps: [
          'Tildá “Mostrar un botón flotante en la tienda”.',
          'Tocá Guardar.',
          'Aparece abajo a la derecha en tu tienda y abre el chat de WhatsApp con un mensaje predefinido.',
        ],
      },
    ],
  },

  customerMessage: {
    title: 'Mensaje para clientes',
    intro: 'Mostrá un mensaje informativo a tus compradores en momentos clave.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: '¿Para qué?',
        paragraphs: [
          'Sirve para avisos como demoras, horarios de despacho, promociones o aclaraciones. Aparece durante el checkout y en el seguimiento del pedido.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Opciones del checkout'] }],
      },
      {
        heading: 'Tiempos de entrega',
        paragraphs: [
          'Si preferís no comprometerte con plazos, podés ocultar los tiempos de entrega de cada medio de envío.',
        ],
      },
    ],
  },
  redes: {
    title: 'Redes sociales',
    intro:
      'Escribí un post una sola vez y publicalo en Facebook, Instagram, X y Telegram a la vez — ahora o programado en el calendario.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'Qué hace el módulo',
        blocks: [
          {
            type: 'table',
            headers: ['Función', 'Qué resuelve'],
            rows: [
              [
                'Cuentas conectadas',
                'Vinculás tus páginas de Facebook, Instagram Business, X y canales de Telegram una sola vez',
              ],
              [
                'Post multi-red',
                'Un texto base sale a todas las cuentas elegidas; podés escribir una versión distinta por red',
              ],
              ['Programación', 'Elegís día y hora y el sistema publica solo (o tocás “Publicar ahora”)'],
              [
                'Calendario',
                'Todo el mes de un vistazo: borradores, programados, publicados y fallidos por día',
              ],
              ['Imágenes del catálogo', 'Adjuntás la foto de un producto sin salir del composer'],
              [
                'Resultado por red',
                'Cada post muestra el link a lo publicado en cada red, o el error si una falló',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Conectar tus cuentas',
        paragraphs: [
          'Facebook e Instagram se conectan juntos: autorizás con tu usuario de Meta y aparecen todas tus páginas con sus cuentas de Instagram Business vinculadas. X se conecta con su propio botón. Telegram no usa autorización: creás un bot con @BotFather, lo hacés administrador de tu canal y pegás el token en el formulario.',
          'Facebook, Instagram y X necesitan una configuración de plataforma que se hace una sola vez; si el botón avisa que falta, es eso. Telegram funciona siempre.',
        ],
        blocks: [
          { type: 'path', segments: ['Redes sociales', 'Cuentas'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Guardamos tokens cifrados, nunca tu contraseña. Si una red revoca el acceso, la cuenta queda marcada “Reconectar” y los posts hacia ella avisan en vez de fallar en silencio.',
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Instagram tiene que ser una cuenta Business (o Creator) vinculada a una página de Facebook — las cuentas personales no permiten publicar por API.',
          },
        ],
      },
      {
        heading: 'Crear y programar un post',
        steps: [
          'Tocá “Nuevo post” (o un día del calendario, que ya viene con la fecha cargada).',
          'Escribí el texto base y elegí en qué cuentas sale.',
          'Sumá imágenes: pegás una URL o elegís la foto de un producto del catálogo.',
          'Si querés, abrí “Versión por red” y ajustá el texto para una red puntual (ej. más corto para X).',
          'Elegí fecha y hora y tocá “Programar” — o “Publicar ahora” y sale en el próximo minuto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'El contador de caracteres usa el límite más chico de las redes elegidas (X: 280, Instagram: 2.200, Facebook: 5.000, Telegram: 4.096). Instagram además exige al menos una imagen — el composer te avisa antes de publicar.',
          },
        ],
      },
      {
        heading: 'Si una red falla',
        paragraphs: [
          'Cada red es independiente: si una publicación falla en X, lo de Facebook e Instagram sale igual. El post queda “Con errores” y en su detalle ves exactamente qué red falló y por qué (token vencido, límite de la red, imagen inválida). Reconectás la cuenta o corregís el post, y lo volvés a programar.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
