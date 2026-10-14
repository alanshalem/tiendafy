import type { HelpArticle } from './helpContent';

export const ENVIOS = {
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
          'Definí el precio (0 = gratis) y, si querés, un plazo o descripción visible, ej: “Llega en 3 a 5 días hábiles”.',
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
          'Hay dos formas de regalar el envío: un medio de envío con precio 0, o un cupón de tipo “Envío gratis”, que deja el envío en $0 sea cual sea el medio que elija el comprador.',
          'Para empujar el ticket, prendé la barra de envío gratis en el editor de diseño (Carrito de compras → “Mostrar barra de envío gratis”) con tu mínimo: le muestra al cliente cuánto le falta.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'La barra solo informa: no cambia lo que cobra el checkout. Si prometés envío gratis desde cierto monto, tiene que haber un medio o un cupón que lo cumpla.',
          },
        ],
      },
      {
        heading: 'Peso y medidas de tus productos',
        paragraphs: [
          'Los correos con cotización en vivo cobran por peso y por tamaño. Cada producto tiene, en su sección de envío, “Peso del paquete (kg)” y las medidas en cm (largo, ancho y alto) del paquete de UNA unidad, listo para despachar. Al cargar un producto nuevo valen para todas sus variantes; después se ajustan variante por variante. También van en la planilla de importación.',
          'Al cotizar, cada unidad del carrito viaja con su peso y sus medidas. Lo que un producto no tenga cargado sale del paquete por defecto de cada correo, que se configura en esta misma pantalla. Las tres medidas van juntas: o las cargás todas o ninguna.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Empezá por los productos grandes o pesados: son los que más se alejan del paquete por defecto, y donde una cotización mal hecha te cuesta plata.',
          },
        ],
      },
      {
        heading: 'Cotización automática: Correo Argentino, Zipnova y Andreani',
        paragraphs: [
          'Además de los métodos manuales, podés conectar cotizadores en vivo: Correo Argentino (a domicilio o a sucursal), Andreani con tu propio contrato, y Zipnova (Andreani, OCA y más transportes detrás de una sola cuenta). El comprador pone su dirección en el checkout y ve los precios reales de todos los que tengas activos, juntos.',
          'Se configuran en esta misma pantalla — mirá los artículos de cada uno.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Opción', 'Precio', 'Etiqueta / despacho'],
            rows: [
              ['Domicilio (manual)', 'Fijo, lo definís vos', 'Lo coordinás vos'],
              ['Retiro en punto', 'Fijo o gratis', 'El cliente retira'],
              ['Correo Argentino', 'Cotizado en vivo por CP', 'Se paga y etiqueta en el panel MiCorreo'],
              ['Andreani', 'Cotizado en vivo por CP', 'Etiqueta PDF desde la venta'],
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
          'Definí el paquete estimado por unidad (peso y medidas): se usa para los productos que no tienen su peso y sus medidas cargados. Límites de Correo: 25 kg y 150 cm por lado.',
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
          'Si el peso y las medidas de tus productos están bien cargados, queda neutro. Los productos sin esos datos cotizan con el paquete por defecto: si varían mucho de tamaño, cargales los suyos.',
        ],
      },
      {
        heading: 'Cómo se calcula el paquete',
        paragraphs: [
          'La cotización usa el peso y las medidas de cada producto del carrito, tal como los cargaste en el producto (o en cada variante). Lo que un producto no tenga cargado sale del paquete estimado por unidad que configuraste acá. Mirá “Peso y medidas de tus productos” en el artículo Medios de envío.',
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
          'Definí el paquete estimado por unidad (peso y medidas en cm), para los productos que no tengan los suyos, y guardá.',
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

  andreani: {
    title: 'Envíos con Andreani',
    intro:
      'Cotización en el checkout por código postal, generación del envío desde la venta, etiqueta PDF y seguimiento, con tu propio contrato de Andreani.',
    category: 'Envíos',
    sections: [
      {
        heading: 'Qué hace la integración',
        paragraphs: [
          'Con la integración activa, el comprador pone su código postal en el checkout y ve el precio real de Andreani para su destino. Después, desde la venta pagada, generás el envío y descargás la etiqueta para pegar en el paquete.',
          'El precio lo firma el servidor al cotizar: no se puede manipular desde el navegador, y si el carrito cambia el checkout pide recotizar.',
        ],
      },
      {
        heading: 'Andreani directo o vía Zipnova',
        paragraphs: [
          'Se puede llegar a Andreani por dos caminos y conviene entender la diferencia antes de elegir.',
          'Con esta integración usás TU contrato con Andreani: negociás vos las tarifas y facturás con ellos. Con Zipnova usás la cuenta de Zipnova, que ya trae Andreani entre sus transportes — es más rápido de arrancar, pero la relación comercial es con Zipnova.',
          'Si ya tenés contrato con Andreani, esta integración te da mejor precio. Si no lo tenés y querés empezar hoy, Zipnova es el camino corto.',
        ],
      },
      {
        heading: 'Qué necesitás',
        steps: [
          'Dar de alta el servicio con Andreani. No hay registro autogestionado: se hace con un ejecutivo comercial y puede tardar varias semanas.',
          'Que te entreguen usuario, contraseña y al menos un número de contrato.',
          'Tu código de cliente (10 dígitos) y la sucursal desde la que despachás.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Un contrato por modalidad',
            text: 'En Andreani cada forma de entrega es un contrato distinto: uno para entrega a domicilio y otro para retiro en sucursal. Si solo tenés uno, el checkout ofrece esa sola opción. Pediles los dos si querés ofrecer las dos.',
          },
        ],
      },
      {
        heading: 'Configurarlo',
        steps: [
          'En Configuración → Medios de envío, tocá “Configurar” en la tarjeta de Andreani.',
          'Cargá usuario y contraseña. La contraseña se guarda cifrada y no se vuelve a mostrar.',
          'Poné el código de cliente y los contratos que tengas.',
          'Completá los datos del remitente y la dirección desde donde despachás: van en cada envío que generes.',
          'Definí el paquete por unidad (peso y medidas), para los productos que no tengan los suyos, y guardá.',
          'Tocá “Probar conexión” para verificar que Andreani te reconoce.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Medios de envío', 'Andreani'] },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Podés cotizar apenas cargás el contrato, incluso antes de tener el resto listo. Los datos del remitente hacen falta recién para generar el primer envío — el panel te avisa si faltan.',
          },
        ],
      },
      {
        heading: 'Las medidas cambian el precio tanto como el peso',
        paragraphs: [
          'Andreani cobra por el mayor entre el peso real del paquete y su “peso volumétrico”, que sale de las medidas. Una caja grande y liviana puede costar más que una chica y pesada.',
          'Por eso las medidas de tus productos (y el paquete por defecto, para los que no las tienen) no son un detalle: si ponés medidas más grandes que las reales, vas a cotizarle de más al comprador; si las ponés más chicas, la diferencia la vas a pagar vos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Andreani no acepta bultos de más de un metro cúbico aproximadamente. Si vendés algo más grande, va a hacer falta dividirlo en varios paquetes.',
          },
        ],
      },
      {
        heading: 'Despachar un pedido, paso a paso',
        steps: [
          'En la venta pagada, tocá “Crear envío en Andreani”: se precargan el destinatario y la dirección.',
          'Revisá los datos. Si el envío es a sucursal, activá esa opción y poné el número de la sucursal donde lo retiran.',
          'Al confirmar, ves el número de seguimiento. Si el pedido va en varios bultos, cada uno tiene el suyo.',
          'Tocá “Etiqueta PDF” y pegá una etiqueta en cada paquete.',
          'Entregá los paquetes a Andreani según lo pactado en tu contrato.',
          'Usá “Seguimiento” cuando quieras saber por dónde va, y “Marcar enviada” en la venta para que el comprador reciba el aviso.',
        ],
      },
      {
        heading: 'Un envío generado no se puede anular',
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Andreani no tiene forma de cancelar un envío desde el sistema: si generás uno de más, no se puede deshacer y probablemente te lo facturen igual. Por eso el panel pide confirmar antes de generar y nunca crea dos envíos para la misma venta, aunque toques el botón dos veces. Si te equivocaste, llamá a tu ejecutivo de Andreani.',
          },
        ],
      },
      {
        heading: 'Errores frecuentes al despachar',
        blocks: [
          {
            type: 'table',
            headers: ['Qué pasa', 'Por qué', 'Cómo se resuelve'],
            rows: [
              [
                'Rechaza el email del comprador',
                'Andreani no acepta emails de más de 40 caracteres',
                'El panel te avisa antes de generar. Usá otro email de contacto',
              ],
              [
                'Rechaza la localidad',
                'Tiene que escribirse igual que en el catálogo de Andreani',
                'Corregí la localidad en el formulario del envío',
              ],
              [
                'No aparece el seguimiento',
                'Andreani lo habilita usuario por usuario',
                'Pedíselo a tu ejecutivo: no alcanza con tener las credenciales',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Sobre los estados del seguimiento',
        paragraphs: [
          'Andreani no publica la lista completa de estados que puede informar, así que traducimos los que conocemos y mostramos “Sin novedades” cuando aparece uno que no reconocemos. En ese caso no le avisamos nada al comprador: preferimos no decirle algo que no entendemos del todo.',
          'El detalle completo del recorrido siempre lo ves en “Seguimiento”, tal como lo informa Andreani.',
        ],
      },
    ],
  },

  despacho: {
    title: 'Despacho de pedidos',
    intro:
      'Para cuando hay muchos pedidos juntos: la cola de lo cobrado sin despachar, una sola lista de picking, las etiquetas y los remitos en un PDF, y despachar escaneando para que no salga nada equivocado.',
    category: 'Envíos',
    keywords: [
      'picking',
      'fulfillment',
      'preparar pedidos',
      'etiquetas',
      'remito',
      'packing slip',
      'expedición',
    ],
    sections: [
      {
        heading: 'La cola de pedidos para preparar',
        paragraphs: [
          'Lista todo lo cobrado y sin despachar, lo más viejo primero (es lo que más espera el comprador). Filtrá por carrier —Andreani, Zipnova, Correo Argentino, retiro en el local o envío propio— y por fecha de cobro.',
          'Elegí los pedidos que vas a preparar juntos y usá las acciones de arriba.',
        ],
        blocks: [{ type: 'path', segments: ['Ventas', 'Despacho'] }],
      },
      {
        heading: 'Lista de picking',
        paragraphs: [
          'Una línea por producto con el total a juntar, la ubicación en el depósito y para qué pedidos va. Viene ordenada por ubicación: es el recorrido por las estanterías. “Imprimir” la saca en una hoja limpia, con un casillero para tildar.',
          'Los pedidos que ya no están para despachar (otra persona los despachó, o tienen un reembolso) quedan afuera, con el motivo.',
        ],
      },
      {
        heading: 'Etiquetas y remitos',
        paragraphs: [
          'Etiquetas junta en un solo PDF las de Andreani y Zipnova de los pedidos elegidos, y te dice cuáles no tienen: los que todavía no tienen envío creado (se crea desde la venta) y los de Correo Argentino, que no entrega la etiqueta por sistema y se imprime desde MiCorreo.',
          'Remitos arma una hoja por pedido con lo que va en la caja (sin precios: puede ser un regalo), la ubicación de cada producto y un QR para escanear el pedido.',
        ],
      },
      {
        heading: 'Despachar escaneando',
        steps: [
          'Escaneá el QR del remito o el número de la etiqueta (#A1B2C3D4). También podés tocar “Escanear” en un pedido de la cola.',
          'Escaneá cada producto al meterlo en la caja: la lista marca lo juntado, y si algo no va en ese pedido o sobra, avisa en el momento.',
          'Con todo completo, cargá el seguimiento (si el envío ya está creado con el carrier, viene cargado) y tocá “Despachar”. El comprador recibe el aviso como siempre.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Antes de despachar, el sistema vuelve a contar lo escaneado contra lo vendido: si falta, sobra o hay un producto de otro pedido, no lo despacha y te dice qué pasó. Lo de esta tanda queda anotado al costado, con los errores.',
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
