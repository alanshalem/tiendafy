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
          'En Clientes ves y buscás tu agenda: nombre, email, teléfono y dirección. Cada venta pagada crea o actualiza sola la ficha del comprador, así la agenda se arma vendiendo.',
          'Con “Agregar cliente” cargás a alguien a mano (un mayorista que nunca compró online, por ejemplo). En la ficha también van notas y la lista de precios que le corresponde.',
        ],
        blocks: [
          { type: 'path', segments: ['Clientes'] },
          {
            type: 'callout',
            tone: 'tip',
            title: '¿Tenías ventas de antes?',
            text: '“Traer de mis ventas” recorre tus ventas anteriores y crea la ficha de cada comprador que todavía no estaba en la agenda.',
          },
        ],
      },
      {
        heading: 'Lista de precios del cliente',
        paragraphs: [
          'Si a un cliente le asignás una lista de precios (por ejemplo “Mayorista”), las ventas manuales y los presupuestos que le hagas usan esos precios solos. La tienda online sigue mostrando el precio de lista. Más en el artículo “Listas de precios”.',
        ],
      },
      {
        heading: 'Exportar',
        paragraphs: [
          '“Exportar” baja la agenda en un CSV que se abre directo en Excel. Lo que te debe cada cliente no está acá: está en Tesorería → Cuentas corrientes.',
        ],
      },
    ],
  },

  bandeja: {
    title: 'Bandeja',
    intro:
      'Todo lo que te escriben, en un solo lugar: los mensajes del formulario de contacto, el chat posventa y las preguntas y mensajes de Mercado Libre. Asignás, respondés y archivás sin saltar de pantalla.',
    category: 'Clientes y comunicación',
    keywords: ['inbox', 'mensajes', 'consultas', 'preguntas', 'atención al cliente', 'asignar'],
    sections: [
      {
        heading: 'Una lista para todos los canales',
        paragraphs: [
          'A la izquierda, las conversaciones de todos los canales, las más recientes arriba y las sin leer en negrita; a la derecha, la que abrís. En el celular se alternan: tocás una conversación y “Volver” te lleva a la lista.',
          'Ves solo los canales que tu rol puede atender: quien atiende Mercado Libre pero no lee el formulario de contacto ve la bandeja sin contacto.',
          'La bandeja se actualiza sola cada medio minuto mientras la tenés a la vista, y el número al lado de “Bandeja” en el menú te dice cuánto hay sin leer aunque estés en otra pantalla.',
        ],
        blocks: [{ type: 'path', segments: ['Bandeja'] }],
      },
      {
        heading: 'Responder sin salir de la bandeja',
        paragraphs: [
          'Cada canal responde por donde siempre: el chat posventa le llega al comprador en su cuenta, el mensaje de contacto se contesta por email (las respuestas del cliente te llegan a vos) y en Mercado Libre la respuesta sale publicada.',
          'Las preguntas de Mercado Libre muestran la publicación —foto, título, precio y stock—, así contestás sin abrir Mercado Libre.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Enter no publica',
            text: 'Una respuesta a una pregunta de Mercado Libre es pública y no se puede editar, y un email no se puede volver atrás: en esos canales Enter es un salto de línea y se manda con el botón o con Ctrl+Enter. Solo el chat posventa envía con Enter.',
          },
        ],
      },
      {
        heading: 'Asignar, marcar y archivar',
        paragraphs: [
          'Asigná cada conversación a alguien del equipo para que no la contesten dos personas (o nadie). Solo aparecen quienes pueden atender ese canal según Roles y permisos. “Tomarla” te la asigna a vos, y la solapa “Mías” junta las tuyas.',
          'Abrir una conversación la marca leída (también en su pantalla de siempre). Si querés volver a mirarla después, “No leída”.',
          'Archivar la saca de la lista hasta que el cliente vuelva a escribir: ahí reaparece sola, sin leer. Lo archivado se ve en la solapa “Archivadas”.',
        ],
      },
      {
        heading: 'Y las pantallas de siempre',
        paragraphs: [
          'Mensajes de contacto, Chat posventa y Mercado Libre siguen andando igual: la bandeja lee de ellas, no las reemplaza.',
        ],
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
          'Vos respondés desde Chat posventa en el menú —una lista con todas las conversaciones, las no leídas primero y con contador— o desde la Bandeja, junto con el resto de los canales.',
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
      {
        heading: 'Una respuesta sugerida con IA',
        paragraphs: [
          'Al lado del campo para responder está “Sugerir con IA”: escribe un borrador de respuesta con lo que dice la conversación y el pedido. Lo revisás, lo corregís y recién ahí lo mandás — nunca sale nada solo.',
          'Si no ves el botón, la plataforma no tiene cargada la clave de IA.',
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
        paragraphs: ['Están agrupados en tres. Activás cada uno por separado.'],
        blocks: [
          { type: 'path', segments: ['Configuración', 'E-mails automáticos'] },
          {
            type: 'table',
            headers: ['Grupo', 'Emails'],
            rows: [
              [
                'Ventas',
                'Confirmación de compra, Confirmación de pago, Lista para retirar (cuando despachás un pedido de retiro), Confirmación de envío (con seguimiento), Cancelación de compra y Factura',
              ],
              ['Cuenta de usuarios', 'Activación de cuenta, Cambio de contraseña y Bienvenida'],
              ['Promociones', 'Carritos abandonados, Bajó un favorito y Volvió un favorito'],
            ],
          },
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
              ['{{order_id}}', 'El número del pedido, sin el # (ej. 1042)'],
              ['{{tracking_link}}', 'El link a “Seguí tu pedido” de esa compra (abre sin pedir datos)'],
              ['{{total}}', 'El total pagado'],
              ['{{items}}', 'La tabla de productos con fotos y precios'],
              ['{{link}}', 'El link de la acción (seguimiento, verificación, carrito…)'],
              ['{{product}}', 'El producto favorito (solo en los avisos de favoritos)'],
              ['{{price}}', 'Su precio nuevo (solo en los avisos de favoritos)'],
            ],
          },
        ],
      },
      {
        heading: 'Avisos de favoritos',
        paragraphs: [
          'Tus clientes con cuenta pueden guardar productos en Favoritos. Si activás “Bajó un favorito”, les llega un email cuando un producto que guardaron baja de precio (al menos un 5%); con “Volvió un favorito”, cuando un producto que estaba sin stock vuelve a tener. El sistema los revisa cada media hora, y manda como mucho un aviso por día por cada favorito.',
          'Vienen apagados: los prendés vos. Son emails de promoción, así que quien se dio de baja de tus novedades no los recibe.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Desde Email marketing también podés armar una campaña para quienes tienen un producto en favoritos: la audiencia más caliente que existe.',
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
            caption:
              'Los estados por los que pasa una campaña, tal como se ven en la lista de Email marketing.',
          },
        ],
      },
      {
        heading: 'Crear y enviar una campaña',
        steps: [
          'En Email marketing → Nueva campaña, escribí el asunto y el contenido. La vista previa de la derecha es EXACTAMENTE lo que recibe el cliente, con tu logo y colores.',
          'Elegí la audiencia: compradores (compraron alguna vez), todos los contactos con email, suscriptores a novedades (los que dejaron su email en el newsletter, el pie o la página de “en construcción”) o una selección manual. Afinala con filtros: cuánto gastó, cuántas compras hizo, si compró hace poco o está inactivo, si compró alguno de ciertos productos o si los tiene en favoritos. El conteo se actualiza en vivo.',
          'Sumá productos destacados: se muestran como tarjetas con foto, precio y link a tu tienda.',
          'Asociá un cupón (opcional): después el detalle te dice cuántas ventas y cuánta plata generó la campaña.',
          'Enviate una prueba, y después Enviar ahora o Programar para una fecha y hora.',
        ],
      },
      {
        heading: 'Segmentar bien vale oro',
        paragraphs: [
          'Ejemplos que funcionan: “gastó más de $100.000” con un cupón VIP; “sin comprar hace 90 días” con un incentivo de vuelta; “compró en los últimos 30 días” para lanzamientos; “compró alguno de estos productos” para venderle el accesorio; “lo tiene en favoritos” cuando ese producto entra en oferta. Un email relevante a 200 personas rinde más que uno genérico a 2.000 — y quema menos tu lista.',
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
            text: 'El tracking de aperturas/clicks y los links de baja necesitan PublicApiBaseUrl configurada en el servidor, y la supresión automática de rebotes necesita el webhook de Resend. El detalle está en el centro de ayuda, en Administrar la plataforma → Qué conseguir y dónde se carga cada cosa.',
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
          'Los tipos de mensaje disponibles son: Confirmación de compra, Confirmación de pago, Pedido en camino, Listo para retirar, Reembolso / cancelación y Carritos abandonados.',
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
        paragraphs: [
          'Se cargan en el editor de diseño: Canales de venta → Tienda online → Contacto (en el grupo 5 · Conversión y contacto).',
        ],
        steps: [
          'Email de la tienda (puede ser distinto al de tu login).',
          'Dirección del local o showroom.',
          'Teléfono de contacto.',
          'WhatsApp.',
          'Si querés, prendé “Mostrar formulario de contacto” para que te escriban desde la tienda: los mensajes llegan a Mensajes de contacto.',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online', 'Contacto'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Como todo lo del editor de diseño, se guarda en el borrador y se ve en la tienda cuando tocás “Publicar cambios”.',
          },
        ],
      },
      {
        heading: '¿Dónde aparece?',
        paragraphs: [
          'Los datos del panel Contacto se muestran en la página de Contacto de tu tienda. Los del pie de página se cargan aparte, en el panel Pie de página → Contacto en el pie, y ahí podés poner varios WhatsApp, direcciones, teléfonos y emails. Cargalos en los dos lugares para que cualquier comprador los encuentre.',
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
        heading: 'Activalo',
        steps: [
          'En Canales de venta → Tienda online, abrí Botón de WhatsApp (grupo 5 · Conversión y contacto).',
          'Tildá “Mostrar botón de WhatsApp” y cargá el número de WhatsApp.',
          'Escribí el “Mensaje inicial”: es el texto que le aparece ya escrito al cliente cuando abre el chat. Hay “Mensajes listos” para elegir uno y ajustarlo.',
          'Elegí la posición (abajo a la izquierda o a la derecha) y, si querés, un texto al lado del ícono, como “¿Te ayudamos?”.',
          'Tocá “Publicar cambios”. El botón aparece en esa esquina de tu tienda.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Botón de WhatsApp'] }],
      },
      {
        heading: 'Cargá bien el número',
        paragraphs: [
          'Con código de país y de área: para Argentina, 54 + 9 (celular) + característica + número. Los espacios y el “+” no molestan.',
          'Con “Mini-chat al pasar el mouse”, en la computadora el botón muestra un mini chat antes de abrir WhatsApp.',
          'Sin número el botón no aparece en tu tienda; en la vista previa del editor sí, para que veas dónde va.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Ejemplo',
            text: 'Para el 11 2345-6789 (CABA, celular) se carga: +54 9 11 2345 6789.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'El mismo número usa el botón “Consultar por este producto” de la página de cada producto, si lo prendés en Detalle de producto.',
          },
        ],
      },
    ],
  },

  customerMessage: {
    title: 'Mensaje para clientes',
    intro: 'Mostrá un aviso a tus compradores en el carrito, y otro al terminar la compra.',
    category: 'Clientes y comunicación',
    sections: [
      {
        heading: 'En el carrito',
        paragraphs: [
          'Sirve para avisos como demoras, horarios de despacho, promociones o aclaraciones. Se carga en el editor de diseño, en Carrito de compras → “Mensaje para clientes”, y se muestra en el carrito. Vacío, no se muestra. Como todo el diseño, sale a la tienda cuando publicás.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Carrito de compras'] }],
      },
      {
        heading: 'Al terminar la compra',
        paragraphs: [
          'Para un mensaje en la pantalla final, junto a la confirmación del pago (“Despachamos en 24 hs hábiles”), usá “Mensaje al terminar la compra” en Configuración → Opciones del checkout. No aparece si el pago se rechaza.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Opciones del checkout'] }],
      },
      {
        heading: 'Plazos de entrega',
        paragraphs: [
          'El plazo que ve el comprador en cada medio de envío es el texto que le pusiste a ese medio (“Llega en 3 a 5 días hábiles”). Si no querés comprometerte con plazos, dejá ese campo vacío. Los correos con cotización en vivo muestran el plazo que informa cada correo.',
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
              [
                'Imágenes del catálogo',
                'Adjuntás la foto de un producto sin salir del composer, y se agrega el link para comprarlo',
              ],
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
        heading: 'Mejorar el texto con IA, y medir lo que vende',
        paragraphs: [
          '“Mejorar con IA” reescribe tu borrador con tono vendedor, sin perder el link ni el cupón que hayas puesto. Es un punto de partida: lo revisás antes de programar. Si no ves el botón, la plataforma no tiene cargada la clave de IA.',
          'Cuando sumás la foto de un producto del catálogo, el post suma también el link a ese producto con una marca de origen, así que las visitas y las ventas que traen aparecen como “Redes sociales” en Estadísticas (Visión general → De dónde llegan tus ventas, y Visitas → Fuentes de tráfico). Si además le ponés un cupón al post, el Reporte de cupones te dice cuánto vendió.',
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
  resenas: {
    title: 'Reseñas de productos',
    intro: 'Las opiniones con estrellas y fotos de quienes te compraron, en la ficha de cada producto.',
    category: 'Clientes y comunicación',
    keywords: ['opiniones', 'estrellas', 'valoraciones', 'reviews', 'comentarios', 'calificaciones'],
    sections: [
      {
        heading: 'Solo opina quien compró',
        paragraphs: [
          'Una reseña nace siempre de una compra despachada: el comprador la escribe desde el link del email que le pedimos la opinión, o desde el detalle de su compra en “Mi cuenta”. Puede opinar una vez por cada producto de cada compra, con estrellas (1 a 5), un título, el texto y hasta 4 fotos.',
          'Por eso todas dicen “Compra verificada”. En la tienda se firma con el nombre y la inicial del apellido (“Ana P.”): nunca el apellido entero ni el email.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Vos moderás, no redactás',
            text: 'Desde el panel podés aprobar, ocultar y responder, pero no escribir ni editar una reseña: las estrellas y el texto son del comprador. Es lo que hace que valgan algo.',
          },
        ],
      },
      {
        heading: 'Moderar',
        paragraphs: [
          'En Reseñas ves las pendientes, las aprobadas y las ocultas. De fábrica, las de 4 y 5 estrellas se publican solas y las demás esperan que las mires: aprobala para que se vea, u ocultala si no corresponde (no habla del producto, insulta, tiene datos personales).',
          'La respuesta de la tienda se publica debajo de la reseña. Contestar una opinión negativa con una solución vende más que ocultarla.',
          'Cualquier visitante puede denunciar una reseña. Cuando tres personas distintas la denuncian, sale de la tienda y vuelve a Pendientes marcada como “Denunciada”, para que decidas vos.',
        ],
        blocks: [{ type: 'path', segments: ['Reseñas'] }],
      },
      {
        heading: 'Configuración',
        paragraphs: [
          'Con “Configuración” en Reseñas elegís desde cuántas estrellas se aprueban solas (o que pasen todas por vos), si la tienda muestra las reseñas, y el email que pide la opinión: si sale y cuántos días después del despacho (de fábrica, 7).',
          'El email sale una sola vez por compra, respeta a quien se dio de baja de tus emails y trae su link de baja. Su texto se edita en Configuración → E-mails automáticos (“Pedido de reseña”).',
        ],
      },
      {
        heading: 'Dónde se ven',
        paragraphs: [
          'En la ficha: las estrellas y la cantidad junto al nombre, y más abajo la sección “Opiniones” con el promedio, cuántas hay de cada estrella (se tocan para filtrar), las fotos en grande y el orden por “Más útiles” o “Más recientes”. En los listados, las estrellas aparecen debajo del nombre de cada producto.',
          'Google también las lee: el promedio y las primeras reseñas van en los datos estructurados de la ficha, y pueden aparecer como estrellas en el resultado de búsqueda.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
