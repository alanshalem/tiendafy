import type { HelpArticle } from './helpContent';

export const VENTAS = {
  payments: {
    title: 'Medios de pago',
    intro:
      'Cobrá las ventas de tu tienda con Mercado Pago, con Payway o con los dos a la vez. La plata va directo a tu cuenta — Tiendafy nunca la toca.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cuál te conviene',
        paragraphs: [
          'Mercado Pago se conecta en un clic desde el panel y cobra con tarjeta, saldo, transferencia y efectivo. Es lo más rápido para arrancar y lo que más formas de pago le da al comprador.',
          'Payway (ex Decidir) cobra solo con tarjeta, pero el comprador nunca sale de tu tienda y las condiciones las negociás vos. El alta la hace un ejecutivo comercial, así que lleva más tiempo.',
          'No son excluyentes: con los dos activos, el checkout muestra las dos opciones.',
        ],
      },
      {
        heading: 'Conectá tu cuenta de Mercado Pago',
        paragraphs: [
          'En Configuración → Medios de pago, tocá “Conectá tu cuenta”. Te llevamos a Mercado Pago para que autorices; al volver, quedás conectado.',
          'Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña. Podés desconectar la cuenta cuando quieras (requiere rol dueño o administrador).',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de pago'] }],
      },
      {
        heading: 'Configuración de la plataforma',
        paragraphs: [
          'Esta integración necesita además una configuración que se hace una sola vez para todo Tiendafy, no por tienda. Está en el centro de ayuda, en Administrar la plataforma → Trámites y altas con proveedores.',
        ],
      },
      {
        heading: 'Checkout Pro vs. Checkout integrado',
        paragraphs: [
          'En ambos casos los datos de la tarjeta los procesa Mercado Pago: nunca tocan los servidores de tu tienda. Cambiás de modo cuando quieras y aplica al instante.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['', 'Checkout Pro', 'Checkout integrado'],
            rows: [
              [
                'Dónde paga',
                'En la página de Mercado Pago (y vuelve a tu tienda)',
                'En tu tienda, sin salir, con tu diseño',
              ],
              [
                'Medios de pago',
                'Todos: tarjetas, dinero en cuenta, Rapipago, cuotas',
                'Tarjetas de crédito y débito, con cuotas',
              ],
              ['Aprobación', 'La mejor tasa (el cliente ya está logueado en MP)', 'Muy buena'],
              ['Ideal para', 'Arrancar sin fricción', 'Experiencia más premium y de marca'],
            ],
          },
        ],
      },
      {
        heading: 'Nombre en el resumen de la tarjeta',
        paragraphs: [
          'Configurá hasta 22 caracteres que el comprador ve en el resumen de su tarjeta (ej: “MI MARCA”). Reduce desconocimientos y contracargos.',
        ],
      },
      {
        heading: 'Probar sin riesgo',
        paragraphs: [
          'Mercado Pago se prueba con cuentas de prueba: creá un usuario vendedor y uno comprador en tu panel de MP, conectá el vendedor y pagá con las tarjetas de prueba.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'El truco del titular',
            text: 'Con las tarjetas de prueba, el nombre del titular decide el resultado: “APRO” aprueba el pago, “OTHE” lo rechaza. Así probás los dos caminos.',
          },
        ],
      },
      {
        heading: 'Comisiones y plazos',
        paragraphs: [
          'Mercado Pago cobra un porcentaje que depende del plazo de liberación del dinero que elijas en tu panel de MP (al instante cuesta más; a 10 o 18 días, menos). La comisión se descuenta antes de acreditarte — el detalle exacto está en tu panel de Mercado Pago, en “Costos”.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Tiendafy no cobra comisión por venta. Lo único que se descuenta de tus cobros es la comisión de Mercado Pago.',
          },
        ],
      },
    ],
  },

  payway: {
    title: 'Cobrar con Payway',
    intro:
      'Cobro con tarjeta de crédito y débito sin que el comprador salga de tu tienda. Payway es el ex Decidir, de Prisma.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'En qué se diferencia de Mercado Pago',
        paragraphs: [
          'Con Mercado Pago el comprador paga con su cuenta, su saldo o su tarjeta, y vos no manejás ninguna relación bancaria: la cuenta se conecta sola desde el panel.',
          'Payway es una pasarela clásica: cobra solo con tarjeta, la plata se acredita según el contrato que firmás con ellos, y el alta la hace un ejecutivo comercial. A cambio, el comprador nunca sale de tu tienda y las comisiones suelen negociarse.',
          'Podés tener los dos activos: el checkout muestra las dos opciones y el comprador elige.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['', 'Mercado Pago', 'Payway'],
            rows: [
              ['Alta', 'Desde el panel, en un clic', 'Con un ejecutivo comercial'],
              ['Medios', 'Tarjeta, saldo, transferencia, efectivo', 'Solo tarjeta de crédito y débito'],
              ['El comprador', 'Puede salir a Mercado Pago', 'Paga dentro de tu tienda'],
              ['Cuotas', 'Las administra Mercado Pago', 'Las acordás con Payway'],
            ],
          },
        ],
      },
      {
        heading: 'Qué necesitás',
        steps: [
          'Dar de alta el comercio con Payway. No hay registro autogestionado: se hace con un ejecutivo comercial y lleva su tiempo.',
          'Que te entreguen el número de comercio (site ID) y dos claves: una pública y una privada.',
          'Que Payway certifique tu integración antes de habilitarte a cobrar de verdad. Podés probar todo en el ambiente de pruebas mientras tanto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Para qué sirve cada clave',
            text: 'La pública viaja al navegador del comprador y sirve para una sola cosa: convertir los datos de la tarjeta en un código. La privada es la que cobra, se guarda cifrada y no sale nunca de nuestro servidor — ni siquiera te la mostramos a vos después de cargarla.',
          },
        ],
      },
      {
        heading: 'Configurarlo',
        steps: [
          'En Configuración → Medios de pago, bajá hasta la tarjeta de Payway.',
          'Cargá el número de comercio y las dos claves.',
          'Elegí el ambiente: empezá en “Pruebas” hasta que Payway te certifique.',
          'Escribí el nombre que querés que aparezca en el resumen de la tarjeta del comprador.',
          'Elegí las cuotas que vas a ofrecer y guardá.',
          'Tocá “Probar conexión” para verificar que Payway responde.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de pago', 'Payway'] }],
      },
      {
        heading: 'Las cuotas se acuerdan con Payway',
        paragraphs: [
          'Payway no tiene forma automática de decirnos qué promociones y planes de cuotas tenés vigentes: eso se pacta con ellos y con los bancos. Las cuotas que elegís en el panel se muestran en el checkout sin recargo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si acordaste cuotas CON interés, no las cargues acá todavía: hoy el checkout las muestra sin recargo y estarías regalando la diferencia. Ofrecé solo los planes sin interés hasta que sumemos el cálculo del costo financiero.',
          },
        ],
      },
      {
        heading: 'Qué ve el comprador',
        paragraphs: [
          'En el checkout elige “Tarjeta de crédito o débito” y completa los datos en tu tienda. Los datos de la tarjeta viajan directo a Payway: no pasan por nuestros servidores ni quedan guardados en ningún lado.',
          'Si el banco rechaza el pago, le mostramos el motivo en castellano y qué puede hacer: probar con otra tarjeta, elegir menos cuotas o llamar al banco.',
        ],
      },
      {
        heading: 'Probar sin cobrar de verdad',
        paragraphs: [
          'Con el ambiente en “Pruebas” podés hacer el circuito completo. Tarjeta de prueba: 4507 9900 0000 4905, cualquier código de seguridad y cualquier vencimiento futuro. Para ver un rechazo, usá 4000 3000 1111 2220.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Los datos de la tarjeta caducan a los 15 minutos de cargarlos. Si el comprador deja el checkout abierto mucho tiempo y después paga, va a tener que cargarlos de nuevo — no es un error.',
          },
        ],
      },
      {
        heading: 'Si un pago queda en duda',
        paragraphs: [
          'Payway no nos avisa solo cuando algo cambia, así que ante un corte de conexión le preguntamos directamente qué pasó con ese pago y adoptamos su respuesta. Nunca reintentamos por las nuestras: es así como se cobra dos veces.',
          'Si ves una venta que quedó sin confirmar, no la vuelvas a cobrar: consultá el estado en el panel de Payway antes de hacer nada.',
        ],
      },
    ],
  },

  ventas: {
    title: 'Ventas y reembolsos',
    intro: 'Seguí cada pedido desde el pago hasta la entrega, y devolvé dinero cuando haga falta.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'El ciclo de una venta',
        paragraphs: [
          'Cuando un cliente paga, la orden aparece en Ventas como “Pagada” (la confirmación llega por Mercado Pago automáticamente, aunque el cliente cierre el navegador).',
          'Al expandir una venta ves los productos, los datos del comprador (nombre, teléfono, DNI/CUIT), la dirección de entrega, el medio de envío elegido, las notas del pedido y el pago asociado.',
        ],
        blocks: [
          {
            type: 'demo',
            demo: 'orderStatuses',
            caption: 'Todos los estados posibles de una venta, tal como se ven en la tabla de Ventas.',
          },
        ],
      },
      {
        heading: 'Despachar un pedido',
        steps: [
          'Expandí la venta y tocá “Marcar enviada”.',
          'Cargá el código de seguimiento (opcional).',
          'El cliente recibe el email de “pedido en camino” automáticamente.',
        ],
      },
      {
        heading: 'Reembolsos totales y parciales',
        paragraphs: [
          'Desde la venta, tocá “Reembolsar”. Podés devolver el total restante o un monto parcial (con motivo opcional). El dinero vuelve por Mercado Pago y la orden pasa a “Reembolsada” o “Reembolso parcial”.',
          'Cada reembolso queda auditado: quién lo hizo, cuándo, cuánto y por qué. El historial se ve en el mismo diálogo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Solo los roles dueño, administrador y finanzas pueden reembolsar. Los reembolsos hechos directo en el panel de Mercado Pago también se sincronizan solos.',
          },
        ],
      },
      {
        heading: 'Carritos abandonados',
        paragraphs: [
          'En Ventas → Carritos abandonados ves quiénes dejaron productos sin pagar. Si activás el email de recuperación, se les envía un recordatorio automático.',
        ],
      },
    ],
  },

  checkout: {
    title: 'El checkout de tu tienda',
    intro: 'Tus clientes compran en pasos claros: carrito → entrega → pago.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cómo es el flujo',
        steps: [
          'Entrega: el cliente deja su email, elige el medio de envío (domicilio o retiro), completa sus datos (nombre, teléfono, dirección) y su DNI o CUIT para la facturación.',
          'Pago: ve el resumen de todo lo elegido (con links “Cambiar”), puede agregar notas del pedido y paga según el modo que configures: redirigido a Mercado Pago o con el formulario de tarjeta embebido.',
          'El costo de envío se suma al total automáticamente y siempre se calcula en el servidor: el cliente no puede manipularlo.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Opciones del checkout'] }],
      },
      {
        heading: 'Cupones en el checkout',
        paragraphs: [
          'El cliente puede aplicar un cupón de descuento desde el resumen del pedido. El descuento se valida y recalcula en el servidor antes de cobrar.',
        ],
      },
      {
        heading: 'Si no configuraste envíos',
        paragraphs: [
          'El paso de entrega se omite y el checkout pide solo los datos de contacto — útil para productos digitales o coordinación manual. Igual te recomendamos crear al menos un medio de envío.',
        ],
      },
    ],
  },

  cupones: {
    title: 'Cupones de descuento',
    intro: 'Creá códigos de descuento para campañas, clientes fieles o recuperar carritos.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Crear un cupón',
        steps: [
          'En Descuentos → Agregar, elegí el código (ej: BIENVENIDA10).',
          'Definí el tipo: porcentaje o monto fijo.',
          'Opcional: monto mínimo de compra, vigencia (desde/hasta) y límite de usos.',
          'Activalo. El cliente lo ingresa en el checkout y el descuento se aplica al instante.',
        ],
        blocks: [
          { type: 'path', segments: ['Descuentos', 'Agregar'] },
          {
            type: 'demo',
            demo: 'coupon',
            caption: 'Así ve el comprador un cupón aplicado en el resumen del pedido.',
          },
        ],
      },
      {
        heading: 'Buenas prácticas',
        paragraphs: [
          'Usá códigos cortos y memorables. Poné vigencia para generar urgencia. El reporte de cupones (Estadísticas → Reporte de cupones) te muestra cuánto se usó cada uno y cuánta plata moviste con ellos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si asociás un cupón a una campaña de email, el detalle de la campaña te muestra cuántas ventas y cuánta plata generó — la forma más confiable de medir marketing.',
          },
        ],
      },
    ],
  },

  mercadolibre: {
    title: 'Integración con Mercado Libre',
    intro:
      'Conectá tu cuenta de vendedor: tus ventas, preguntas y mensajes de ML en el panel, stock unificado entre canales y publicación desde tu catálogo.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Qué hace la integración',
        blocks: [
          {
            type: 'table',
            headers: ['Función', 'Qué resuelve'],
            rows: [
              [
                'Ventas ML en el panel',
                'Cada venta de Mercado Libre aparece en la pestaña Ventas del canal, con comprador, productos y estado',
              ],
              ['Preguntas prevente', 'Respondés las preguntas de tus publicaciones sin entrar a ML'],
              ['Mensajes posventa', 'El chat con el comprador de cada venta, en un modal del panel'],
              [
                'Stock unificado',
                'Una venta en ML descuenta stock acá; tu stock se empuja a las publicaciones vinculadas',
              ],
              [
                'Publicar desde el catálogo',
                'Creás una publicación en ML con el título, precio, fotos y stock de tu producto',
              ],
              ['Reclamos', 'Los reclamos abiertos de ML, visibles antes de que escalen'],
            ],
          },
        ],
      },
      {
        heading: 'Antes que nada: los dos niveles de credenciales',
        paragraphs: [
          'La integración tiene dos patas y conviene no confundirlas. La app de PLATAFORMA se registra UNA sola vez ante Mercado Libre (es “Tiendafy” presentándose como aplicación: un Client ID y un Client Secret que viven en el servidor). Recién con eso existe el botón de conectar. Después, CADA tienda autoriza su propia cuenta de vendedor con un click — sin cargar ninguna clave.',
          'Es el mismo esquema que Mercado Pago (que ya tiene su app configurada, por eso su botón funciona). Ojo: aunque sea la misma empresa, Mercado Libre y Mercado Pago usan apps SEPARADAS en portales de desarrolladores distintos — la app de MP no sirve para ML.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Nivel', 'Quién lo hace', 'Cuántas veces', 'Qué se carga'],
            rows: [
              [
                'App de plataforma',
                'Quien administra el servidor',
                'Una sola vez',
                'Client ID + Client Secret de la app de ML, en la configuración del servidor',
              ],
              [
                'Cuenta de la tienda',
                'Cada tienda, desde el panel',
                'Una vez por tienda',
                'Nada: autoriza con su usuario de ML (OAuth)',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Configuración de la plataforma',
        paragraphs: [
          'Esta integración necesita además una configuración que se hace una sola vez para todo Tiendafy, no por tienda. Está en el centro de ayuda, en Administrar la plataforma → Trámites y altas con proveedores.',
        ],
      },
      {
        heading: 'Conectar la cuenta de cada tienda',
        steps: [
          'En Configuración → Mercado Libre, tocá “Conectar mi cuenta”.',
          'Te llevamos a Mercado Libre para que autorices con tu usuario de vendedor; al volver, quedás conectado.',
          'Se importan solas tus últimas ventas (también podés tocar “Importar últimas ventas” cuando quieras).',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Mercado Libre'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Usamos el OAuth oficial de Mercado Libre: guardamos tokens cifrados, nunca tu usuario ni tu contraseña. Podés desconectar cuando quieras y tus publicaciones no se tocan. Cada tienda conecta SU cuenta de vendedor: las de la misma empresa no se mezclan.',
          },
        ],
      },
      {
        heading: 'El panel del canal',
        paragraphs: [
          'En el menú, Canales de venta → Mercado Libre. Tiene cuatro pestañas: Ventas (con las métricas de los últimos 30 días), Preguntas (respondé las pendientes ahí mismo), Publicaciones (vinculá cada una con tu catálogo, o publicá productos nuevos) y Reclamos.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Mercado Libre'] }],
      },
      {
        heading: 'Stock unificado: cómo funciona',
        steps: [
          'En la pestaña Publicaciones, tocá “Vincular” en cada publicación y elegí el producto (y variante) de tu catálogo que le corresponde.',
          'Activá “Sincronizar stock” en Configuración → Mercado Libre.',
          'Desde ahí: cada venta en ML descuenta el stock local automáticamente, y los cambios de stock locales se empujan a las publicaciones cada ~5 minutos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Una publicación SIN vincular no sincroniza nada: la venta de ML aparece en el panel igual, pero no descuenta tu stock. Vinculá todo lo que vendas en los dos canales para no sobrevender.',
          },
        ],
      },
      {
        heading: 'Publicar un producto en ML',
        steps: [
          'En Publicaciones → “Publicar un producto en ML”, elegí un producto activo de tu catálogo.',
          'Mercado Libre sugiere la categoría según el título — elegí la correcta (una categoría mal elegida puede hacer que ML pause la publicación).',
          'Al publicar, la publicación nace vinculada: el stock ya queda sincronizado.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Los productos con varias variantes se publican con su primera variante (Mercado Libre maneja las variaciones distinto). Si necesitás variaciones en ML, crealas en su editor y vinculalas a mano.',
          },
        ],
      },
      {
        heading: 'Mensajes y preguntas: reglas de ML',
        blocks: [
          {
            type: 'checklist',
            items: [
              'La conversación posventa la inicia SIEMPRE el comprador; vos respondés.',
              'Los mensajes tienen un máximo de 350 caracteres.',
              'Responder preguntas rápido mejora tu reputación como vendedor (y tus ventas).',
              'Todo lo que escribas pasa por la moderación de Mercado Libre: nada de datos de contacto ni links externos.',
            ],
          },
        ],
      },
      {
        heading: 'Métricas multicanal',
        paragraphs: [
          'En Estadísticas → Visión general aparece la tarjeta de Mercado Libre con lo facturado, las ventas y las unidades vendidas de los últimos 30 días — al lado de los números de tu tienda, para ver el negocio completo.',
        ],
      },
    ],
  },

  rentabilidad: {
    title: 'Rentabilidad real',
    intro:
      'Vender no es ganar. Esta sección te muestra cuánta plata te queda de verdad de cada venta: lo facturado menos el costo de tus productos y la comisión de Mercado Pago.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cargá el costo de tus productos',
        paragraphs: [
          'Todo empieza por decirle al sistema cuánto te cuesta cada producto. Sin costo cargado, la tienda sabe cuánto facturás pero no cuánto ganás.',
        ],
        steps: [
          'Andá a Productos → Costos: vas a ver cada variante con su precio y un campo para el costo (en pesos).',
          'Cargá el costo y tocá Guardar. El margen se calcula al instante para que veas si estás vendiendo demasiado barato.',
          'Para catálogos grandes usá el CSV: la plantilla de Exportar/Importar ahora tiene la columna «Costo». Exportá, completá esa columna en Excel y volvé a importar.',
        ],
      },
      {
        heading: 'Qué muestra Estadísticas → Rentabilidad',
        paragraphs: [
          'La ganancia real del período: ventas de productos (netas de cupones) menos el costo de lo vendido y menos la comisión exacta que cobró Mercado Pago en cada pago (el sistema la lee de MP al confirmarse el pago, no la estima).',
          'La tabla por producto expone lo importante: cuáles dejan plata y cuáles venden mucho pero dejan poco. Un margen menor al 15% se marca en rojo.',
          'El costo de cada venta queda congelado al momento de venderse: si mañana te sube el costo, las ganancias de ventas pasadas no cambian.',
        ],
      },
      {
        heading: 'Por qué puede decir «X de Y ventas tienen costo»',
        paragraphs: [
          'La ganancia solo se calcula sobre las ventas cuyos productos tenían costo cargado al momento de venderse — el resto se excluye para no inventar números. A medida que cargues costos, las ventas nuevas van a entrar completas.',
          'El envío cobrado al cliente no se cuenta como ganancia: se asume que cubre lo que le pagás al correo.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
