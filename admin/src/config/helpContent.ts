import type { HelpLinkId } from './features';

export interface HelpSection {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
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
      },
      {
        heading: 'Checkout Pro vs. Checkout integrado',
        paragraphs: [
          'Checkout Pro: el cliente paga en la página de Mercado Pago y vuelve a tu tienda. Cero fricción para arrancar, todos los medios de pago (tarjetas, dinero en cuenta, Rapipago, cuotas) y la mejor tasa de aprobación.',
          'Checkout integrado: el cliente carga su tarjeta sin salir de tu tienda, con tu diseño. Experiencia más premium; acepta tarjetas de crédito y débito con cuotas.',
          'En ambos casos los datos de la tarjeta los procesa Mercado Pago: nunca tocan los servidores de tu tienda. Cambiás de modo cuando quieras y aplica al instante.',
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
          'Mercado Pago se prueba con cuentas de prueba: creá un usuario vendedor y uno comprador en tu panel de MP, conectá el vendedor y pagá con las tarjetas de prueba (titular APRO aprueba, OTHE rechaza).',
        ],
      },
      {
        heading: 'Comisiones y plazos',
        paragraphs: [
          'Tiendafy no cobra comisión por venta. Mercado Pago sí: un porcentaje que depende del plazo de liberación del dinero que elijas en tu panel de MP (al instante cuesta más; a 10 o 18 días, menos). La comisión se descuenta antes de acreditarte — el detalle exacto está en tu panel de Mercado Pago, en “Costos”.',
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
        steps: [
          'Tu CUIT y tu razón social (el nombre legal del negocio).',
          'Saber tu categoría: Responsable Inscripto o Monotributo.',
          'Tu clave fiscal de ARCA (la misma con la que hacés trámites en su web).',
          'El número de punto de venta habilitado en ARCA para Web Services — o darlo de alta ahí, es un trámite corto (el paso 3 te lo explica).',
        ],
      },
      {
        heading: 'Paso 1 — Datos del emisor',
        steps: [
          'En Configuración → Facturación, cargá tu CUIT y razón social (como figuran en ARCA).',
          'Elegí tu condición: Responsable Inscripto o Monotributo.',
          'Dejá el ambiente en Homologación: es el modo de práctica, con facturas de prueba sin validez fiscal. A Producción pasás recién cuando todo funciona.',
        ],
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
        steps: [
          'ARCA: la AFIP renombrada — el organismo de impuestos al que se le pide cada factura.',
          'CAE: el “sello de aprobación” que ARCA le pone a cada factura. Sin CAE no vale; con CAE es oficial. Tiene fecha de vencimiento.',
          'Punto de venta: el “cajón numerado” de tus comprobantes (el 0001 de “0001-00000123”). Podés tener varios: uno para la web, otro para el local.',
          'Certificado digital: el “DNI” de tu tienda para hablar con ARCA por internet — ARCA solo le contesta a quien tenga uno válido a su nombre.',
          'Clave privada: el secreto que acompaña al certificado. Nunca se comparte con nadie (ni con ARCA); Tiendafy la genera y la guarda cifrada.',
          'CSR: el “formulario de pedido” del certificado. Tiendafy lo arma, vos lo subís a ARCA, ARCA te devuelve el certificado. Una sola vez.',
          'TA: el pase de entrada temporal que ARCA le da a tu tienda; dura 12 horas y se renueva solo.',
          'Homologación: el modo de práctica de ARCA — idéntico al real pero las facturas no valen. Siempre se prueba ahí primero.',
          'Nota de Crédito: la “factura al revés” que compensa una venta anulada o devuelta.',
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
          'Solo los roles dueño, administrador y finanzas pueden reembolsar. Los reembolsos hechos directo en el panel de Mercado Pago también se sincronizan solos.',
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
      },
      {
        heading: 'Buenas prácticas',
        paragraphs: [
          'Usá códigos cortos y memorables. Poné vigencia para generar urgencia. El reporte de cupones (Estadísticas → Reporte de cupones) te muestra cuánto se usó cada uno y cuánta plata moviste con ellos.',
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
      },
      {
        heading: 'Importante: en Zipnova todo es real',
        paragraphs: [
          'Zipnova no tiene modo de prueba ni sandbox. Cotizar no cuesta nada, pero CREAR un envío es un envío de verdad: consume saldo de tu cuenta y genera documentación de despacho. Por eso el panel te pide confirmar antes de crear, y nunca crea dos envíos para la misma venta aunque toques el botón dos veces.',
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
      },
      {
        heading: 'Inventario y reservas',
        paragraphs: [
          'El stock se controla por variante en Productos → Inventario. Cuando un cliente inicia el pago, su stock se reserva; si no paga en 30 minutos, la reserva se libera sola — nunca vendés lo que no tenés.',
          'El historial de movimientos de cada variante muestra entradas, ventas y reservas.',
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
          'En el detalle de cada campaña enviada ves: enviados y fallidos, aperturas y clicks (las aperturas están subestimadas: muchos clientes de correo bloquean imágenes), bajas que generó, costo estimado y — si asociaste un cupón — las ventas y el dinero atribuidos a la campaña. Esa última es la métrica en la que conviene decidir.',
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
      },
      {
        heading: 'Conectar y probar',
        steps: [
          'En Configuración → WhatsApp automático, pegá el Phone Number ID y el token, y tocá Conectar.',
          'Usá “Enviar mensaje de prueba” con tu propio número para validar la conexión (en modo prueba de Meta solo llega a números registrados como testers).',
        ],
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
          'No cumplir puede traerte sanciones. Cargá la info verdadera de tu negocio.',
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
          'Ejemplo: para 11 2345-6789 (CABA, celular) se carga 5491123456789.',
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
          'Los cambios se guardan como borrador automáticamente; tu tienda pública no cambia hasta que toques “Publicar”.',
        ],
      },
      {
        heading: 'Tu marca en todos lados',
        paragraphs: [
          'El logo y el color primario que definas acá se usan también en los e-mails automáticos que reciben tus clientes. Subí un logo de hasta ~160 px de ancho para que se vea nítido.',
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
          'En Configuración → Códigos externos hay dos cajas: la de <head> es para etiquetas de medición y verificación (Google Analytics, Meta Pixel, Search Console); la de antes de </body> es para widgets y chats. Lo que pegues se carga en todas las páginas de tu tienda.',
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
        paragraphs: [
          'Pegá solo códigos de servicios que conozcas: un script se ejecuta con acceso total a la página. Un script roto o lento puede afectar la velocidad o el funcionamiento de tu tienda — si algo se rompe después de pegar un código, borralo y guardá.',
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
      },
      {
        heading: 'Los roles',
        steps: [
          'Dueño: control total. Único que gestiona dominios, el plan y a otros dueños.',
          'Administrador: todo lo operativo y la configuración, sin plan ni gestión de dueños.',
          'Vendedor: ventas (ver y despachar), clientes, chat posventa y mensajes. No puede reembolsar ni tocar configuración.',
          'Catálogo: productos, categorías, inventario e imágenes. No ve ventas ni clientes.',
          'Finanzas: lectura de ventas y estadísticas + ejecutar reembolsos + ver la configuración de pagos.',
          'Soporte: chat posventa, mensajes de contacto y lectura de pedidos para dar contexto.',
        ],
      },
      {
        heading: 'Reglas de seguridad',
        paragraphs: [
          'Nadie puede asignar un rol por encima del propio, solo un dueño puede nombrar o modificar dueños, y la tienda nunca puede quedar sin dueño. Todo intento de acción sin permiso se bloquea y queda registrado.',
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
