import type { HelpLinkId } from './features';

/** Demos visuales: componentes REALES del panel renderizados dentro del artículo. */
export type HelpDemoId =
  | 'orderStatuses' // badges de estado de una venta, idénticos a los de Ventas
  | 'campaignStatuses' // badges de estado de una campaña de email
  | 'switch' // el toggle on/off que se usa en todas las configuraciones
  | 'helpLink' // el link "Más sobre…" que aparece al pie de cada pantalla
  | 'coupon' // cómo ve el comprador un cupón aplicado en el checkout
  | 'storefrontPreview'; // mini tienda interactiva para el artículo de diseño

export type HelpBlock =
  | { type: 'callout'; tone: 'tip' | 'info' | 'warning' | 'danger'; title?: string; text: string }
  | { type: 'path'; label?: string; segments: string[] } // ruta dentro del panel: "Configuración → Medios de pago"
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'terms'; items: { term: string; def: string }[] } // diccionario término → definición
  | { type: 'checklist'; items: string[] }
  | { type: 'demo'; demo: HelpDemoId; caption?: string };

export interface HelpSection {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  /** Bloques ricos (callouts, tablas, demos…) — se renderizan después del texto. */
  blocks?: HelpBlock[];
}

export interface HelpArticle {
  title: string;
  intro: string;
  /** Agrupa los artículos en el índice del centro de ayuda. */
  category: string;
  sections: HelpSection[];
}

/** Manuales reales de cada parte del sistema. Se muestran en /ayuda/:topic. */
export const HELP_CONTENT: Record<HelpLinkId, HelpArticle> = {
  // ---------------------------------------------------------------- Empezar
  primerosPasos: {
    title: 'Abrí tu tienda en 7 pasos',
    intro: 'Todo lo que necesitás para pasar de cero a vender, en orden.',
    category: 'Empezar',
    sections: [
      {
        heading: 'El camino completo',
        steps: [
          'Diseñá tu tienda: en Canales de venta → Tienda online elegí colores, tipografía y subí tu logo (también aparece en los emails que reciben tus clientes).',
          'Cargá tus productos: en Productos → Agregar, con fotos, precio, variantes y stock. Si tenés muchos, usá la importación por CSV.',
          'Conectá Mercado Pago: en Configuración → Medios de pago, con un click autorizás tu cuenta. La plata va directo a vos.',
          'Definí los envíos: en Configuración → Medios de envío creá al menos uno (domicilio con precio fijo o retiro gratis). Sin esto el checkout no ofrece entrega.',
          'Revisá los e-mails automáticos: en Configuración → E-mails automáticos activá los que quieras; salen con tu logo y colores.',
          'Invitá a tu equipo: en Configuración → Usuarios sumá gente con roles (vendedor, catálogo, finanzas, soporte…).',
          'Compartí tu URL: tu tienda ya vive en tutienda.tiendafy. Cuando quieras, conectá tu dominio propio.',
        ],
      },
      {
        heading: 'Probá una compra de punta a punta',
        paragraphs: [
          'Antes de difundir tu tienda, hacete una compra de prueba: agregá un producto al carrito, completá el checkout (email → entrega → pago) y pagá con las tarjetas de prueba de Mercado Pago.',
          'Verificá que la orden aparezca en Ventas, que llegue el email de confirmación y que puedas marcarla como enviada.',
        ],
        blocks: [
          {
            type: 'checklist',
            items: [
              'La orden aparece en Ventas como “Pagada”.',
              'Llegó el email de confirmación con tu logo y colores.',
              'Pudiste marcarla como enviada y llegó el aviso de “pedido en camino”.',
              'Si configuraste facturación, la venta muestra su factura con CAE.',
            ],
          },
        ],
      },
      {
        heading: 'La ayuda te sigue a todos lados',
        paragraphs: [
          'No hace falta memorizar nada: al pie de cada pantalla del panel hay un link que abre la guía de esa pantalla en una pestaña nueva.',
        ],
        blocks: [
          {
            type: 'demo',
            demo: 'helpLink',
            caption:
              'Este link aparece al pie de cada pantalla del panel y abre el artículo correspondiente.',
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------- Ventas y pagos
  payments: {
    title: 'Medios de pago',
    intro:
      'Cobrá las ventas de tu tienda conectando Mercado Pago. La plata va directo a tu cuenta — Tiendafy nunca la toca.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Conectá tu cuenta de Mercado Pago',
        paragraphs: [
          'En Configuración → Medios de pago, tocá “Conectá tu cuenta”. Te llevamos a Mercado Pago para que autorices; al volver, quedás conectado.',
          'Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña. Podés desconectar la cuenta cuando quieras (requiere rol dueño o administrador).',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Medios de pago'] },
          {
            type: 'callout',
            tone: 'info',
            title: 'Si el botón falla o dice que falta configuración',
            text: 'El OAuth necesita que la app de PLATAFORMA de Mercado Pago esté registrada en el servidor (Client ID + Client Secret, una sola vez, por quien administra la plataforma). Es el mismo esquema de dos niveles que la integración con Mercado Libre — el detalle está en docs/CONFIGURACION.md del proyecto.',
          },
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

  // ------------------------------------------------- Legal y facturación
  fiscal: {
    title: 'Facturación electrónica (ARCA)',
    intro:
      'Conectá tu tienda con ARCA (ex AFIP) y cada venta se factura sola, con CAE oficial y PDF descargable.',
    category: 'Legal y facturación',
    sections: [
      {
        heading: '¿Qué es y por qué lo necesito?',
        paragraphs: [
          'Cuando alguien te compra, la ley te obliga a entregarle una factura oficial. Esa factura no se “inventa”: se le pide a ARCA (el organismo del Estado, la ex-AFIP), que la aprueba y le pone un número de autorización llamado CAE. Tiendafy hace todo ese trámite por vos: configurás una vez y cada venta se factura sola.',
          'Según tu condición fiscal se emite el comprobante correcto: Factura C si sos Monotributista; si sos Responsable Inscripto, Factura B a consumidor final o Factura A a otra empresa (con IVA desglosado).',
        ],
      },
      {
        heading: 'Antes de empezar, tené a mano',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Tu CUIT y tu razón social (el nombre legal del negocio).',
              'Saber tu categoría: Responsable Inscripto o Monotributo.',
              'Tu clave fiscal de ARCA (la misma con la que hacés trámites en su web).',
              'El número de punto de venta habilitado en ARCA para Web Services — o darlo de alta ahí, es un trámite corto (el paso 3 te lo explica).',
            ],
          },
        ],
      },
      {
        heading: 'Paso 1 — Datos del emisor',
        steps: [
          'En Configuración → Facturación, cargá tu CUIT y razón social (como figuran en ARCA).',
          'Elegí tu condición: Responsable Inscripto o Monotributo.',
          'Dejá el ambiente en Homologación: es el modo de práctica, con facturas de prueba sin validez fiscal. A Producción pasás recién cuando todo funciona.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Facturación'] }],
      },
      {
        heading: 'Paso 2 — Certificado digital',
        paragraphs: [
          'El certificado es el “DNI” de tu tienda ante ARCA: sin él, ARCA no acepta pedidos de factura. Se obtiene con un ida y vuelta simple:',
        ],
        steps: [
          'Tocá “Generar solicitud (CSR)” y descargá el archivo.',
          'Entrá a ARCA con tu clave fiscal → “Administración de Certificados Digitales” → creá un alias y subí el CSR.',
          'ARCA te devuelve el certificado firmado: copialo y pegalo en el panel. Listo.',
          'Después, en “Administrador de Relaciones de Clave Fiscal”, autorizá al servicio “Facturación Electrónica” (wsfe) para ese alias.',
        ],
      },
      {
        heading: 'Tu clave privada nunca sale de acá',
        paragraphs: [
          'La clave privada del certificado se genera y se guarda cifrada en el servidor: no se muestra, no se descarga y no viaja por la API. Solo se usa internamente para firmar los pedidos a ARCA. Si alguien la tuviera podría facturar en tu nombre — por eso se cuida así.',
          'Además, solo los roles Dueño, Administrador y Finanzas pueden tocar la configuración fiscal o emitir comprobantes; un vendedor o soporte no puede.',
        ],
      },
      {
        heading: 'Paso 3 — Puntos de venta',
        paragraphs: [
          'El punto de venta es el “talonario” numerado de tus facturas (el 0001 de “0001-00000123”). Se crea en ARCA: “Administración de puntos de venta y domicilios”, con el sistema de facturación “Web Services”. Después cargás ese número en el panel.',
        ],
      },
      {
        heading: 'Paso 4 — Preferencias de emisión',
        paragraphs: [
          'Elegí si la factura se emite sola (recomendado) y cuándo: al confirmarse el pago o al despachar el pedido. También podés definir el punto de venta por defecto y el umbral de consumidor final (por encima de ese monto, la factura exige DNI/CUIT del comprador — el checkout ya se lo pide).',
        ],
      },
      {
        heading: 'Probar y pasar a Producción',
        steps: [
          'Con todo configurado en Homologación, hacete una compra de prueba y verificá que la venta muestre su factura con CAE.',
          'Descargá el PDF desde el detalle de la venta (panel Facturación).',
          'Cuando funcione, repetí el certificado para el ambiente Producción (ARCA usa certificados separados) y cambiá el ambiente. Desde ahí, facturas reales.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'El certificado de Homologación NO sirve en Producción: ARCA usa certificados separados por ambiente. Al pasar a Producción hay que repetir el trámite del certificado una vez más.',
          },
        ],
      },
      {
        heading: 'Reembolsos y notas de crédito',
        paragraphs: [
          'Las facturas aprobadas no se borran (ARCA no lo permite): se compensan con una Nota de Crédito, la “factura al revés”. Si reembolsás una venta facturada, Tiendafy la emite automáticamente — el círculo fiscal queda cerrado sin trámites manuales.',
        ],
      },
      {
        heading: '¿Por qué la factura puede tardar unos minutos?',
        paragraphs: [
          'La factura se emite “por atrás”, después de cerrar la venta. Es a propósito: ARCA a veces está lento o en mantenimiento, y si el botón de pagar dependiera de su respuesta, una caída de ARCA te rompería la venta. Primero se cobra (tu cliente ya compró), y la factura sale minutos después; si ARCA está caído, Tiendafy reintenta solo hasta que salga. Es como lo hacen todos los sistemas serios.',
        ],
      },
      {
        heading: 'Diccionario de palabras raras',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'ARCA',
                def: 'La AFIP renombrada — el organismo de impuestos al que se le pide cada factura.',
              },
              {
                term: 'CAE',
                def: 'El “sello de aprobación” que ARCA le pone a cada factura. Sin CAE no vale; con CAE es oficial. Tiene fecha de vencimiento.',
              },
              {
                term: 'Punto de venta',
                def: 'El “cajón numerado” de tus comprobantes (el 0001 de “0001-00000123”). Podés tener varios: uno para la web, otro para el local.',
              },
              {
                term: 'Certificado digital',
                def: 'El “DNI” de tu tienda para hablar con ARCA por internet — ARCA solo le contesta a quien tenga uno válido a su nombre.',
              },
              {
                term: 'Clave privada',
                def: 'El secreto que acompaña al certificado. Nunca se comparte con nadie (ni con ARCA); Tiendafy la genera y la guarda cifrada.',
              },
              {
                term: 'CSR',
                def: 'El “formulario de pedido” del certificado. Tiendafy lo arma, vos lo subís a ARCA, ARCA te devuelve el certificado. Una sola vez.',
              },
              {
                term: 'TA',
                def: 'El pase de entrada temporal que ARCA le da a tu tienda; dura 12 horas y se renueva solo.',
              },
              {
                term: 'Homologación',
                def: 'El modo de práctica de ARCA — idéntico al real pero las facturas no valen. Siempre se prueba ahí primero.',
              },
              {
                term: 'Nota de Crédito',
                def: 'La “factura al revés” que compensa una venta anulada o devuelta.',
              },
            ],
          },
        ],
      },
    ],
  },

  legal: {
    title: 'Requisitos legales en Argentina',
    intro: 'Lo que una tienda online debe cumplir por ley — y cómo Tiendafy ya te cubre en cada punto.',
    category: 'Legal y facturación',
    sections: [
      {
        heading: 'Datos de contacto visibles',
        paragraphs: [
          'La Resolución 104/2005 de Defensa del Consumidor exige mostrar email, dirección y teléfono reales. Cargalos en Configuración → Opciones del checkout → Información de contacto: aparecen en la página de Contacto y en el pie de tu tienda.',
        ],
      },
      {
        heading: 'Botón de arrepentimiento',
        paragraphs: [
          'La Resolución 424/2020 obliga a ofrecer un “Botón de Arrepentimiento” accesible desde la home: el comprador puede revocar la compra dentro de los 10 días corridos de recibida, sin costo.',
          'Tu tienda ya lo incluye automáticamente en el pie de página. Cuando un cliente lo usa, la solicitud te llega a la bandeja de Mensajes con el asunto normalizado y un número de constancia — respondé coordinando la devolución y hacé el reembolso desde la venta.',
        ],
      },
      {
        heading: 'Términos y condiciones / Política de privacidad',
        paragraphs: [
          'Tu tienda publica automáticamente Términos y condiciones y Política de privacidad genéricos en /terminos y /privacidad, enlazados desde el pie.',
          'Si querés textos propios, creá en Páginas una página con la URL “terminos” o “privacidad”: tu versión reemplaza a la genérica automáticamente.',
        ],
      },
      {
        heading: 'Facturación obligatoria',
        paragraphs: [
          'Toda venta debe facturarse ante ARCA. Configurá la facturación electrónica en Configuración → Facturación y se emite sola (mirá el artículo de Facturación electrónica).',
        ],
      },
      {
        heading: 'Defensa del consumidor',
        paragraphs: [
          'La Ley 24.240 aplica a todas tus ventas: garantía legal de los productos, información veraz de precios (el precio final debe incluir impuestos) y derecho a devolución. Publicar una política de cambios clara en una página de contenido evita el 90% de los conflictos.',
        ],
      },
      {
        heading: 'Resumen: qué exige la ley y quién lo resuelve',
        blocks: [
          {
            type: 'table',
            headers: ['Obligación', 'Norma', 'Cómo quedás cubierto'],
            rows: [
              [
                'Datos de contacto visibles',
                'Res. 104/2005',
                'Vos los cargás una vez; aparecen solos en Contacto y en el pie',
              ],
              [
                'Botón de arrepentimiento',
                'Res. 424/2020',
                'Ya está en el pie de tu tienda; las solicitudes llegan a Mensajes',
              ],
              [
                'Términos y privacidad',
                'Ley 25.326',
                'Se publican versiones genéricas; podés reemplazarlas con tus páginas',
              ],
              ['Factura por cada venta', 'ARCA', 'Configurás la facturación una vez y se emite sola'],
              [
                'Precios finales e info veraz',
                'Ley 24.240',
                'Mostrá precios con impuestos y una política de cambios clara',
              ],
            ],
          },
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
        heading: 'Configuración inicial de la plataforma (una sola vez)',
        paragraphs: [
          'Si el panel dice “faltan las credenciales de la app de Mercado Libre en el servidor”, falta este paso:',
        ],
        steps: [
          'Entrá a developers.mercadolibre.com.ar con una cuenta de Mercado Libre → “Mis aplicaciones” → crear aplicación.',
          'Redirect URI: la URL pública de la API + /api/v1/meli/oauth/callback (en desarrollo hace falta un túnel tipo cloudflared/ngrok, igual que con Mercado Pago).',
          'Notificaciones: URL pública de la API + /api/v1/webhooks/meli, suscripta al topic orders_v2 — así cada venta de ML llega sola al panel.',
          'Cargá el Client ID, el Client Secret y la Redirect URI en la configuración del servidor (sección MercadoLibre; el detalle exacto está en docs/CONFIGURACION.md del proyecto) y reiniciá la API.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'El Client Secret es una credencial de servidor: nunca va en el panel, en el navegador ni en un repositorio. En desarrollo se carga con user-secrets; en producción, como variable de entorno.',
          },
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

  // -------------------------------------------------------------- Envíos
  shipping: {
    title: 'Medios de envío',
    intro: 'Definí cómo entregás los pedidos y cuánto paga el comprador. Se eligen en el checkout.',
    category: 'Envíos',
    sections: [
      {
        heading: 'Crear un medio de envío',
        steps: [
          'En Configuración → Medios de envío, tocá “Agregar medio de envío”.',
          'Elegí el tipo: Envío a domicilio (el cliente carga su dirección) o Retiro en punto (vos cargás la dirección y horarios del punto).',
          'Definí el precio (0 = gratis) y un plazo visible, ej: “Llega en 3 a 5 días hábiles”.',
          'Guardá. Aparece al instante en el checkout de tu tienda.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de envío'] }],
      },
      {
        heading: 'Cómo lo ve el comprador',
        paragraphs: [
          'En el paso Entrega del checkout, el cliente ve todas las opciones activas con su precio y plazo, y elige una. El costo se suma al total y queda registrado en la orden y en el email de confirmación.',
          'Podés desactivar un método sin borrarlo (deja de ofrecerse pero conserva el historial).',
        ],
      },
      {
        heading: 'Envío gratis como gancho',
        paragraphs: [
          'Creá un método con precio 0 (“Envío gratis a partir de $X” en la descripción) y activá la barra de envío gratis desde el editor de diseño (sección Carrito): le muestra al cliente cuánto le falta y sube el ticket promedio.',
        ],
      },
      {
        heading: 'Cotización automática: Correo Argentino y Zipnova',
        paragraphs: [
          'Además de los métodos manuales, podés conectar cotizadores en vivo: Correo Argentino (a domicilio o a sucursal) y Zipnova (Andreani, OCA y más transportes detrás de una sola cuenta, con etiqueta PDF). El comprador pone su dirección en el checkout y ve los precios reales de todos los que tengas activos, juntos.',
          'Se configuran en esta misma pantalla — mirá los artículos de Correo Argentino y de Zipnova.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Opción', 'Precio', 'Etiqueta / despacho'],
            rows: [
              ['Domicilio (manual)', 'Fijo, lo definís vos', 'Lo coordinás vos'],
              ['Retiro en punto', 'Fijo o gratis', 'El cliente retira'],
              ['Correo Argentino', 'Cotizado en vivo por CP', 'Se paga y etiqueta en el panel MiCorreo'],
              [
                'Zipnova (Andreani, OCA…)',
                'Cotizado en vivo por ciudad y CP',
                'Etiqueta PDF directa desde la venta',
              ],
            ],
          },
        ],
      },
    ],
  },

  correoArgentino: {
    title: 'Envíos con Correo Argentino',
    intro:
      'Conectá la API oficial MiCorreo: el checkout cotiza el envío en vivo por código postal y los envíos se dan de alta desde la venta.',
    category: 'Envíos',
    sections: [
      {
        heading: 'Qué hace la integración',
        paragraphs: [
          'Cuando está activa, el comprador ingresa su código postal en el checkout y ve las tarifas reales de Correo Argentino: entrega a domicilio y retiro en una sucursal de Correo (elige cuál, por provincia). El precio se suma al total y queda registrado en la venta.',
          'El precio lo firma el servidor al cotizar: el comprador no puede manipularlo, y si el carrito cambia después de cotizar, el checkout pide recotizar.',
        ],
      },
      {
        heading: 'Qué necesitás',
        steps: [
          'Una cuenta gratuita en MiCorreo (correoargentino.com.ar/MiCorreo) con tus datos de facturación.',
          'Las credenciales de API (userToken y passwordToken): se piden por el formulario de contacto de MiCorreo. Correo te da credenciales de PRUEBA y de PRODUCCIÓN por separado.',
          'Tu customerId de MiCorreo. Si no lo sabés, en la configuración podés poner tu email y contraseña de MiCorreo y lo buscamos por vos (no se guardan).',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Las credenciales de PRUEBA y de PRODUCCIÓN son juegos distintos: las de prueba no funcionan en producción ni al revés. Guardá cada juego con su ambiente.',
          },
        ],
      },
      {
        heading: 'Configurarlo',
        steps: [
          'En Configuración → Medios de envío, tocá “Configurar” en la tarjeta de Correo Argentino.',
          'Pegá el userToken y el passwordToken. Se guardan cifrados y nunca se vuelven a mostrar.',
          'Cargá el código postal desde donde despachás.',
          'Definí el paquete estimado por unidad (peso y medidas): la cotización multiplica por la cantidad de productos del carrito. Límites de Correo: 25 kg y 150 cm por lado.',
          'Elegí qué ofrecer: domicilio, sucursal o ambos. Guardá y tocá “Probar cotización” para validar todo con datos reales.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de envío', 'Correo Argentino'] }],
      },
      {
        heading: 'Empezá en modo prueba',
        paragraphs: [
          'Con el ambiente en “Prueba (homologación)” cotizás contra el servidor de prueba de Correo: ideal para validar la configuración sin tocar tu cuenta real. Cuando funcione, cambiá a Producción con las credenciales de producción.',
        ],
      },
      {
        heading: 'Qué ve y hace el comprador',
        steps: [
          'En el paso Entrega del checkout, pone su código postal y toca “Calcular”.',
          'Ve las tarifas reales con el plazo estimado (ej: “Clásico a domicilio $4.500, llega en 2 a 5 días”).',
          'Si elige a domicilio, completa su dirección como siempre. Si elige sucursal, selecciona provincia y sucursal de Correo de una lista — no carga dirección, retira él.',
          'Paga con el envío ya sumado al total. En la venta te queda registrado el método, el costo y la dirección (o la sucursal elegida con su código, ej: “Sucursal Monte Grande (B0107)”).',
        ],
      },
      {
        heading: 'El flujo completo cuando te compran',
        paragraphs: [
          'Automático: la cotización, el precio (firmado por el servidor, no manipulable), la dirección o sucursal en la venta, y el aviso al cliente cuando marcás enviada.',
          'Un click: “Crear envío en Correo Argentino” en la venta pagada — importa el envío a tu cuenta de MiCorreo con el destinatario y la dirección precargados, sin retipear nada.',
          'Manual (en el panel de MiCorreo, la API de Correo no lo permite de otra forma): pagar el envío, generar la etiqueta y obtener el número de seguimiento. Es igual en todas las plataformas que integran MiCorreo.',
        ],
      },
      {
        heading: 'Despachar un pedido, paso a paso',
        steps: [
          'En la venta pagada, tocá “Crear envío en Correo Argentino”: se precargan el destinatario y la dirección — revisalos y confirmá.',
          'El envío queda importado en tu cuenta de MiCorreo (con el número de tu orden).',
          'Entrá al panel de MiCorreo: el envío ya está cargado. Pagalo y generá la etiqueta — recién ahí Correo te da el número de seguimiento.',
          'Imprimí la etiqueta, pegala al paquete y llevalo a tu sucursal de Correo.',
          'Volvé a la venta y tocá “Marcar enviada” con ese número de seguimiento: el cliente recibe el email (y WhatsApp si lo activaste) de “pedido en camino” automáticamente.',
        ],
      },
      {
        heading: 'Quién paga qué',
        paragraphs: [
          'El costo del envío lo cobrás VOS en la venta (va sumado al total que paga el comprador por Mercado Pago). Después vos le pagás a Correo el envío real al generar la etiqueta en MiCorreo.',
          'Si el paquete estimado está bien configurado, queda neutro. Si tus productos varían mucho de peso, ajustá el paquete por defecto o asumí la diferencia como costo.',
        ],
      },
      {
        heading: 'Cómo se calcula el paquete',
        paragraphs: [
          'Los productos todavía no tienen peso propio, así que la cotización usa el paquete estimado por unidad que configuraste: peso × cantidad, apilados en alto. Si tus productos varían mucho de tamaño, configurá el promedio y ajustá el envío real en MiCorreo al despachar.',
          'Si un carrito supera los límites de Correo (25 kg / 150 cm), el checkout lo avisa y el comprador puede elegir otro medio de envío o coordinar con vos.',
        ],
      },
    ],
  },

  zipnova: {
    title: 'Envíos con Zipnova',
    intro:
      'Andreani, OCA y más transportes detrás de una sola API: cotización en vivo en el checkout y envíos con etiqueta PDF desde la venta.',
    category: 'Envíos',
    sections: [
      {
        heading: 'Qué hace la integración',
        paragraphs: [
          'Zipnova es un agregador: una sola cuenta te conecta con varios transportes a la vez. Con la integración activa, el comprador pone su ciudad y código postal en el checkout y ve las opciones reales de tu cuenta (por ejemplo “Andreani Estándar $4.200” y “OCA Estándar $4.600”), cada una con su fecha estimada.',
          'El precio lo firma el servidor al cotizar: no se puede manipular, y si el carrito cambia el checkout pide recotizar.',
        ],
      },
      {
        heading: 'Qué necesitás',
        steps: [
          'Una cuenta en Zipnova con al menos un transporte habilitado y saldo.',
          'Las credenciales de API: en el panel de Zipnova, Configuración → Integraciones → Gestionar credenciales y webhooks. Ahí generás el API Token y el API Secret.',
          'Tu número de cuenta (account ID) — figura en el mismo panel.',
        ],
      },
      {
        heading: 'Configurarlo',
        steps: [
          'En Configuración → Medios de envío, tocá “Configurar” en la tarjeta de Zipnova.',
          'Pegá el API Token y el API Secret. Se guardan cifrados y nunca se vuelven a mostrar.',
          'Elegí el país de tu cuenta (define a qué servidor de Zipnova se habla) y cargá el número de cuenta.',
          'Origen: dejalo vacío para usar el origen por defecto de tu cuenta Zipnova, o poné el ID de una ubicación puntual.',
          'Definí el paquete estimado por unidad (peso y medidas en cm) y guardá.',
          'Usá “Probar cotización”: cotizar es gratis y valida todo el circuito con datos reales.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de envío', 'Zipnova'] }],
      },
      {
        heading: 'Importante: en Zipnova todo es real',
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Cotizar no cuesta nada, pero CREAR un envío es un envío de verdad: consume saldo de tu cuenta y genera documentación de despacho. Por eso el panel te pide confirmar antes de crear, y nunca crea dos envíos para la misma venta aunque toques el botón dos veces.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Modo de prueba',
            text: 'Si querés probar el circuito completo sin gastar saldo, escribile a soporte de Zipnova y pedí que habiliten la modalidad “testing” en tu cuenta. Cuando arranques a operar en serio, la desactivan.',
          },
        ],
      },
      {
        heading: 'Despachar un pedido, paso a paso',
        steps: [
          'En la venta pagada, tocá “Crear envío en Zipnova”: se precargan el destinatario y la dirección — revisá y completá provincia y documento (Zipnova exige nombre, documento, email y teléfono).',
          'Al confirmar, el envío queda creado y ves el número de Zipnova, el transporte asignado y su código de seguimiento.',
          'Tocá “Etiqueta PDF”: se descarga lista para imprimir y pegar en el paquete (si recién creaste el envío puede tardar unos minutos en estar disponible).',
          'Despachá según la forma de tu cuenta (retiro del transporte o entrega en punto de despacho).',
          'Cargá el código de seguimiento en la venta con “Marcar enviada” — el cliente lo recibe por email. El link “Seguimiento” te muestra el estado en Zipnova en cualquier momento.',
        ],
      },
      {
        heading: 'Correo Argentino y Zipnova a la vez',
        paragraphs: [
          'Podés tener las dos integraciones activas: el comprador ve todas las opciones cotizadas juntas en el checkout y elige la que prefiera. También podés pausar una sin desconectarla.',
        ],
      },
    ],
  },

  distributionCenters: {
    title: 'Centros de distribución',
    intro: 'Si despachás desde más de un depósito o local, registrá cada uno acá.',
    category: 'Envíos',
    sections: [
      {
        heading: '¿Para qué sirve?',
        paragraphs: [
          'Un centro de distribución es un punto desde el que salen tus envíos o donde el cliente retira. Si tenés varios, los administrás por separado.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Centros de distribución'] }],
      },
      {
        heading: 'Cómo agregar uno',
        steps: [
          'Tocá “Agregar”.',
          'Cargá el nombre y la dirección del centro.',
          'Guardá. Después podés asociarlo a tus medios de envío.',
        ],
      },
    ],
  },

  // ------------------------------------------------------------- Catálogo
  productos: {
    title: 'Productos e inventario',
    intro: 'Cargá tu catálogo con variantes, fotos y stock, y mantenelo al día sin esfuerzo.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Cargar un producto',
        steps: [
          'En Productos → Agregar, cargá nombre, descripción, precio y fotos (la primera es la principal y sale en los emails).',
          'Si tiene talles o colores, definí opciones y variantes: cada combinación tiene su propio SKU, precio y stock.',
          'Asignale categorías para que aparezca en los filtros de tu tienda.',
          'Publicalo. Los borradores y archivados no se ven en la tienda.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Agregar'] }],
      },
      {
        heading: 'Inventario y reservas',
        paragraphs: [
          'El stock se controla por variante en Productos → Inventario. Cuando un cliente inicia el pago, su stock se reserva; si no paga en 30 minutos, la reserva se libera sola — nunca vendés lo que no tenés.',
          'El historial de movimientos de cada variante muestra entradas, ventas y reservas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Anti-sobreventa',
            text: 'Dos clientes no pueden pagar la última unidad a la vez: el primero que inicia el pago la reserva; el segundo ve “sin stock” hasta que la reserva se libere.',
          },
        ],
      },
      {
        heading: 'Importación y exportación masiva',
        paragraphs: [
          'En Productos → Exportar e importar podés bajar todo tu catálogo a CSV, editarlo en Excel/Sheets y volver a subirlo. También sirve para migrar desde otra plataforma. Las imágenes se importan por URL en una segunda pasada.',
        ],
      },
    ],
  },

  // ----------------------------------------------- Clientes y comunicación
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
          'Los e-mails automáticos son transaccionales: confirman compras, envíos, cuentas — se disparan solos. Las campañas son marketing: VOS decidís cuándo escribirle a tu base (“llegó la colección nueva”, “20% este finde”). Viven en Marketing, en el menú principal.',
        ],
        blocks: [
          { type: 'path', segments: ['Marketing'] },
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

  // ----------------------------------------------------- Tu tienda online
  tema: {
    title: 'Diseño de tu tienda',
    intro: 'Editá colores, tipografías, logo y secciones sin tocar código, con vista previa en vivo.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'El editor visual',
        paragraphs: [
          'En Canales de venta → Tienda online armás tu tienda por secciones: portada, productos destacados, banners, beneficios, carrito y más. Todo con vista previa al instante.',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online'] },
          {
            type: 'demo',
            demo: 'storefrontPreview',
            caption:
              'Probalo acá mismo: tocá un color y mirá cómo cambia toda la tienda. En el editor real es igual, pero con TU tienda y tus productos.',
          },
        ],
      },
      {
        heading: 'Borrador y publicar',
        paragraphs: [
          'Los cambios se guardan como borrador automáticamente; tu tienda pública no cambia hasta que toques “Publicar”. Podés experimentar tranquilo: nadie ve el borrador más que vos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si te arrepentís de un cambio, el editor tiene deshacer/rehacer. Y mientras no publiques, tu tienda pública sigue exactamente igual.',
          },
        ],
      },
      {
        heading: 'Tu marca en todos lados',
        paragraphs: [
          'El logo y el color primario que definas acá se usan también en los e-mails automáticos que reciben tus clientes. Subí un logo de hasta ~160 px de ancho para que se vea nítido.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Los emails usan el tema PUBLICADO',
            text: 'Si cambiaste el logo y en los emails sigue apareciendo el anterior, es porque el cambio quedó en el borrador: tocá “Publicar”. Y para email usá PNG/JPG — los SVG no se muestran en Gmail ni Outlook — con colores que se vean sobre fondo blanco.',
          },
        ],
      },
      {
        heading: 'Galería de diseños',
        paragraphs: [
          'Si preferís arrancar de una base, la galería trae combinaciones listas de colores y tipografías. Las aplicás y después ajustás lo que quieras.',
        ],
      },
    ],
  },

  paginas: {
    title: 'Páginas de contenido',
    intro: 'Creá páginas propias: quiénes somos, cómo comprar, política de cambios, lo que necesites.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Crear una página',
        steps: [
          'En Páginas → Agregar, poné el título y escribí el contenido con el editor.',
          'La URL se genera sola (ej: /paginas/como-comprar).',
          'Publicala. Las no publicadas quedan como borrador, invisibles para tus clientes.',
        ],
        blocks: [
          { type: 'path', segments: ['Páginas', 'Agregar'] },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si creás una página con la URL “terminos” o “privacidad”, reemplaza automáticamente a la versión genérica que publica tu tienda.',
          },
        ],
      },
      {
        heading: 'Dónde se ven',
        paragraphs: [
          'Las páginas publicadas se pueden enlazar desde el pie de página de tu tienda y desde cualquier sección del editor de diseño.',
        ],
      },
    ],
  },

  estadisticas: {
    title: 'Estadísticas',
    intro: 'Mirá cómo va tu negocio: ventas, productos, visitas y cupones.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Qué encontrás',
        steps: [
          'Visión general: facturación, pedidos y ticket promedio del período.',
          'Productos: los más vendidos y los más vistos.',
          'Ventas y clientes: evolución de ventas y compradores nuevos vs. recurrentes.',
          'Visitas: tráfico de tu tienda y páginas más vistas.',
          'Tiempo real: quién está navegando tu tienda ahora.',
          'Reporte de cupones: uso y descuento total de cada código.',
        ],
        blocks: [{ type: 'path', segments: ['Estadísticas'] }],
      },
      {
        heading: 'Quién las ve',
        paragraphs: [
          'Dueño, administrador, vendedor y finanzas. Los roles catálogo y soporte no acceden a los números del negocio.',
        ],
      },
    ],
  },

  seo: {
    title: 'Aparecer en Google (SEO)',
    intro:
      'Tu tienda ya viene optimizada para buscadores. Esto es lo que hace sola y lo que podés mejorar vos.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Tu título y descripción en Google',
        paragraphs: [
          'En el editor de diseño (Canales de venta → Tienda online → Identidad → “Cómo aparecés en Google”) definís el título y la descripción que se muestran en los resultados de búsqueda. Un buen título: “Marca — qué vendés” en menos de 60 caracteres; la descripción, un gancho de hasta 160.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Identidad'] }],
      },
      {
        heading: 'Lo que la tienda hace sola',
        paragraphs: [
          'Cada tienda genera automáticamente su sitemap (/sitemap.xml), su robots.txt y las URLs canónicas. Los productos publican datos estructurados (precio, stock, fotos) para que Google pueda mostrarlos como resultados enriquecidos, y las páginas de producto usan la primera foto como imagen al compartir en redes.',
        ],
      },
      {
        heading: 'Conectá Google Search Console',
        steps: [
          'Entrá a search.google.com/search-console y agregá tu dominio como propiedad.',
          'Elegí verificación por “Etiqueta HTML”, copiá la etiqueta y pegala en Configuración → Códigos externos (sección <head>). Guardá y verificá.',
          'En Sitemaps, enviá la URL de tu sitemap: tudominio.com/sitemap.xml.',
          'En unos días vas a ver qué búsquedas te traen visitas y si hay errores de indexación.',
        ],
      },
      {
        heading: 'Buenas prácticas de contenido',
        paragraphs: [
          'Nombres de producto descriptivos (lo que la gente busca, no códigos internos), descripciones únicas y completas, y categorías bien armadas. Si cambiás la URL de un producto, creá una redirección 301 en Configuración → Redireccionamientos para no perder el posicionamiento ganado.',
          'Un dominio propio (en vez del subdominio gratis) suma confianza y marca — conectalo cuando estés listo.',
        ],
      },
    ],
  },

  externalCodes: {
    title: 'Analytics, Pixel y códigos externos',
    intro: 'Medí tu tráfico y tus campañas insertando los scripts de Google, Meta o el chat que uses.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Dónde va cada cosa',
        paragraphs: [
          'En Configuración → Códigos externos hay dos cajas. Lo que pegues se carga en todas las páginas de tu tienda.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Códigos externos'] },
          {
            type: 'table',
            headers: ['Caja', 'Para qué sirve', 'Ejemplos'],
            rows: [
              [
                '<head>',
                'Etiquetas de medición y verificación',
                'Google Analytics, Meta Pixel, Search Console',
              ],
              ['Antes de </body>', 'Widgets visibles y chats', 'Chats de atención, botones de terceros'],
            ],
          },
        ],
      },
      {
        heading: 'Google Analytics 4',
        steps: [
          'En analytics.google.com creá una propiedad para tu tienda y elegí plataforma “Web”.',
          'Copiá el código de la etiqueta de Google (empieza con <script async src="https://www.googletagmanager.com/gtag/js…").',
          'Pegalo en la caja de <head> y guardá. Los datos empiezan a aparecer en minutos (probá con “Tiempo real”).',
        ],
      },
      {
        heading: 'Meta Pixel (Facebook e Instagram Ads)',
        steps: [
          'En el Administrador de eventos de Meta creá un píxel para tu negocio.',
          'Elegí “Instalar el código manualmente”, copiá el bloque del píxel.',
          'Pegalo en la caja de <head> y guardá. Verificalo con la extensión Meta Pixel Helper.',
        ],
      },
      {
        heading: 'Cuidados',
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Pegá solo códigos de servicios que conozcas: un script se ejecuta con acceso total a la página. Un script roto o lento puede afectar la velocidad o el funcionamiento de tu tienda — si algo se rompe después de pegar un código, borralo y guardá.',
          },
        ],
      },
    ],
  },

  ajustesAvanzados: {
    title: 'Ajustes avanzados',
    intro: 'Redirecciones 301, idioma y moneda, y campos personalizados — los ajustes finos de tu tienda.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Redireccionamientos 301',
        paragraphs: [
          'Cuando una URL vieja deja de existir (cambiaste el nombre de un producto, borraste una página), creá una redirección 301 hacia la nueva. El visitante no ve un error y Google transfiere el posicionamiento a la URL nueva. Formato: desde “/producto-viejo” hacia “/productos/nuevo-slug”.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Regla simple: cada vez que cambies o borres una URL que ya estaba publicada, creá su redirección en el momento. Es un minuto que protege meses de posicionamiento.',
          },
        ],
      },
      {
        heading: 'Idiomas y monedas',
        paragraphs: [
          'Definí el idioma y la moneda con que opera tu tienda (por defecto, español de Argentina y pesos). Afecta textos, formatos de precio y el checkout.',
        ],
      },
      {
        heading: 'Campos personalizados',
        paragraphs: [
          'Agregá atributos propios a tus productos (material, dedicatoria, talle especial…) cuando las opciones estándar no alcanzan. Definí el nombre y el tipo de dato, y usalos para enriquecer tu catálogo.',
        ],
      },
    ],
  },

  // --------------------------------------------------------------- Equipo
  users: {
    title: 'Roles y permisos',
    intro: 'Invitá a tu equipo y dale a cada persona exactamente lo que necesita — ni más ni menos.',
    category: 'Equipo',
    sections: [
      {
        heading: 'Agregar a alguien',
        steps: [
          'La persona se registra en Tiendafy con su email (una vez).',
          'En Configuración → Usuarios, tocá “Agregar”, poné su email y elegí el rol.',
          'Listo: al entrar al panel ve solo las secciones y acciones de su rol.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Usuarios'] }],
      },
      {
        heading: 'Los roles',
        blocks: [
          {
            type: 'table',
            headers: ['Rol', 'Qué puede', 'Qué NO puede'],
            rows: [
              ['Dueño', 'Control total: dominios, plan y gestión de otros dueños', '—'],
              ['Administrador', 'Todo lo operativo y la configuración', 'Plan y gestión de dueños'],
              [
                'Vendedor',
                'Ventas (ver y despachar), clientes, chat posventa y mensajes',
                'Reembolsar ni tocar configuración',
              ],
              ['Catálogo', 'Productos, categorías, inventario e imágenes', 'Ver ventas ni clientes'],
              [
                'Finanzas',
                'Leer ventas y estadísticas, ejecutar reembolsos, ver config de pagos',
                'Editar catálogo ni configuración general',
              ],
              [
                'Soporte',
                'Chat posventa, mensajes de contacto y lectura de pedidos',
                'Modificar ventas o configuración',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Reglas de seguridad',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Nadie puede asignar un rol por encima del propio.',
              'Solo un dueño puede nombrar o modificar dueños.',
              'La tienda nunca puede quedar sin dueño.',
              'Todo intento de acción sin permiso se bloquea y queda registrado.',
            ],
          },
        ],
      },
    ],
  },

  domains: {
    title: 'Dominios',
    intro: 'Tu tienda ya vive en un subdominio gratis; cuando quieras, conectás tu dominio propio.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Subdominio gratis',
        paragraphs: [
          'Apenas creás la tienda tenés una URL del tipo tutienda.tiendafy. En desarrollo es tutienda.localhost:3000. Ya funciona, no hace falta configurar nada.',
        ],
      },
      {
        heading: 'Configurá tu dominio propio',
        steps: [
          'Comprá tu dominio en cualquier registrador (por ej. tudominio.com).',
          'En el panel de tu registrador, apuntá un registro CNAME a la plataforma.',
          'Agregá el dominio en la sección Dominios y guardá.',
          'Esperá la propagación de DNS (puede tardar hasta 48 hs).',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'La propagación de DNS no depende de Tiendafy ni de tu registrador solamente: cada proveedor de internet actualiza a su ritmo. Si a las 48 hs sigue pendiente, ahí sí hay que revisar la configuración.',
          },
        ],
      },
      {
        heading: 'Verificá la configuración',
        paragraphs: [
          'Cuando el DNS propague, el estado del dominio pasa a “Activado”. Si sigue pendiente después de 48 hs, revisá que el CNAME apunte exactamente a donde indicamos y que no haya registros A en conflicto.',
        ],
      },
      {
        heading: 'Vencimiento del dominio',
        paragraphs: [
          'El dominio lo renovás en tu registrador (no en Tiendafy). Activá la renovación automática para no quedarte sin tu dirección. Si vence, tu tienda deja de responder en ese dominio (pero sigue viva en el subdominio gratis).',
        ],
      },
      {
        heading: 'Certificado de seguridad (SSL)',
        paragraphs: [
          'El candado HTTPS se emite y renueva solo, sin que hagas nada. Cuando el dominio queda activo, el estado del certificado pasa a “SSL activado”. Puede tardar unos minutos extra después de que el dominio propague.',
        ],
      },
    ],
  },
};
