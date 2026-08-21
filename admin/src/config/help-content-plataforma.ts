import type { HelpArticle } from './helpContent';

/**
 * Guías para quien administra la plataforma, no para quien vende.
 *
 * El resto del centro de ayuda está escrito para el comerciante: qué botón
 * tocar y qué esperar. Acá vive todo lo otro — infraestructura, claves del
 * servidor, altas comerciales, certificaciones — que antes estaba repartido
 * como secciones sueltas dentro de los manuales de cada función. Repartido no
 * servía: para saber qué faltaba para arrancar había que abrir ocho artículos
 * distintos y juntar los pedazos.
 */
export const PLATAFORMA = {
  plataformaPuestaEnMarcha: {
    title: 'Poner Tiendafy en marcha, punta a punta',
    intro:
      'El recorrido completo de un sistema vacío a una tienda vendiendo: qué se levanta, en qué orden, y qué bloquea qué.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'La regla que ordena todo: dos niveles',
        paragraphs: [
          'Cada credencial de Tiendafy es de uno de dos tipos, y confundirlos es la causa número uno de "lo configuré y no anda".',
          'Las de PLATAFORMA son de Tiendafy como producto: se cargan una sola vez, viven en la configuración del servidor y necesitan reiniciar la API. Las de TIENDA son de cada comercio: se cargan desde el panel, se guardan cifradas y no tocan el servidor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si un botón de “conectar” avisa que falta configuración, falta el nivel plataforma. Si una integración te pide usuario y contraseña dentro del panel, es de nivel tienda y no hay nada que tocar en el servidor.',
          },
        ],
      },
      {
        heading: 'El orden en que conviene hacerlo',
        paragraphs: [
          'Cada paso habilita al siguiente. Saltear uno hace que el que viene falle por un motivo que no parece relacionado.',
        ],
        steps: [
          'Infraestructura: servidor, base de datos PostgreSQL, almacenamiento de imágenes (MinIO o S3) y el proxy que resuelve los certificados.',
          'DNS de la plataforma: el dominio base, el comodín para los subdominios de las tiendas, la API y el panel.',
          'Claves de plataforma mínimas: base de datos, almacenamiento y Resend. Sin emails no se puede ni invitar a alguien al equipo.',
          'App de Mercado Pago: es lo que hace existir el botón de “conectar tu cuenta” en cada tienda.',
          'Crear la primera tienda y su dueño.',
          'Desde el panel de esa tienda: conectar el cobro, configurar envíos y cargar el certificado de facturación.',
          'Las opcionales, cuando hagan falta: Mercado Libre, redes sociales, IA, Meta Ads.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Si falta…', 'Qué deja de andar'],
            rows: [
              ['Base de datos', 'Todo'],
              ['Almacenamiento de imágenes', 'Subir fotos de productos'],
              ['Resend', 'Todos los emails: invitaciones, confirmación de compra, campañas'],
              ['URL pública de la API', 'Webhooks de pago, links de baja y tracking de campañas'],
              ['App de Mercado Pago', 'El botón de conectar cobros, en todas las tiendas'],
              ['DNS comodín', 'Los subdominios de las tiendas nuevas'],
            ],
          },
        ],
      },
      {
        heading: 'Qué necesita cada integración',
        paragraphs: [
          'Cinco de las integraciones no piden NADA a nivel plataforma: las credenciales son del comercio y se cargan desde el panel. Lo que sí necesitan es que alguien haga el alta con el proveedor.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Integración', 'Nivel plataforma (una vez)', 'Nivel tienda (cada una)'],
            rows: [
              ['Mercado Pago', 'App marketplace + webhook', 'Conectar la cuenta (un click)'],
              ['Mercado Libre', 'App de desarrolladores + webhook', 'Conectar la cuenta (un click)'],
              ['Payway', '— nada', 'Site ID y las dos claves'],
              ['Correo Argentino', '— nada', 'Credenciales de MiCorreo'],
              ['Zipnova', '— nada', 'API Token y Secret'],
              ['Andreani', '— nada', 'Usuario, contraseña y contratos'],
              ['ARCA (facturación)', '— nada', 'Certificado, CUIT y punto de venta'],
              ['WhatsApp', '— nada', 'App propia de Meta con su número'],
              ['Redes sociales', 'Apps de Meta y X', 'Conectar cada cuenta'],
              ['Emails', 'Cuenta de Resend con dominio verificado', '— nada'],
            ],
          },
        ],
      },
      {
        heading: 'DNS de la plataforma',
        paragraphs: [
          'Se configura una sola vez. El proxy emite y renueva los certificados solo, también para los dominios propios de cada tienda: la primera visita al dominio dispara la emisión.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Registro', 'Nombre', 'Apunta a', 'Para qué'],
            rows: [
              ['A', 'TUDOMINIO', 'IP del servidor', 'Dominio base'],
              ['A (comodín)', '*.TUDOMINIO', 'IP del servidor', 'Subdominios de todas las tiendas'],
              ['A', 'api.TUDOMINIO', 'IP del servidor', 'La API: webhooks, OAuth, emails'],
              ['A', 'admin.TUDOMINIO', 'IP del servidor', 'El panel de administración'],
              ['CNAME', 'dominio del comercio', 'TUDOMINIO', 'Lo crea el dueño del dominio, en su proveedor'],
            ],
          },
        ],
      },
      {
        heading: 'Antes de abrir una tienda al público',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Un medio de cobro conectado y probado con una compra real de monto chico',
              'Al menos un medio de envío configurado, con un envío de prueba generado',
              'Facturación con el certificado de producción, no el de pruebas',
              'Emails llegando de verdad: dominio del remitente verificado',
              'Dominio propio apuntado y con certificado emitido',
              'Un segundo dueño cargado en Usuarios y permisos',
              'Datos de contacto, términos y política de devoluciones publicados',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Lo del segundo dueño no es burocracia: si la única cuenta con control total pierde el acceso, no hay forma de administrar la tienda desde el panel.',
          },
        ],
      },
    ],
  },

  plataformaClaves: {
    title: 'Qué conseguir y dónde se carga cada cosa',
    intro:
      'El inventario completo: cada credencial que usa el sistema, dónde se saca, dónde se carga y qué deja de funcionar si falta.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Cómo leer esta guía',
        paragraphs: [
          'La columna “Dónde se carga” es la que importa. “Servidor” significa configuración del backend y reinicio de la API. “Panel” significa que lo carga el dueño de la tienda desde Configuración, sin ayuda técnica.',
          'Los nombres exactos de cada variable viven en docs/CONFIGURACION.md del repositorio, que se actualiza junto con el código. Acá va el qué y el porqué.',
        ],
      },
      {
        heading: 'Imprescindibles',
        paragraphs: ['Sin esto el sistema no arranca, o arranca a medias.'],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Si falta'],
            rows: [
              ['PostgreSQL', 'Tu servidor', 'Servidor', 'No arranca nada'],
              [
                'Almacenamiento MinIO o S3',
                'Tu servidor o un proveedor',
                'Servidor',
                'No se pueden subir fotos',
              ],
              [
                'Resend: API key',
                'resend.com',
                'Servidor',
                'Los emails se escriben en el log en vez de enviarse',
              ],
              [
                'Resend: dominio verificado',
                'resend.com → Domains (SPF y DKIM en tu DNS)',
                'Tu DNS',
                'Los emails van a spam o los rechazan',
              ],
              [
                'URL pública de la API',
                'Es tu propio dominio',
                'Servidor',
                'Webhooks de pago, links de baja y tracking rotos',
              ],
              [
                'Mercado Pago: app marketplace',
                'mercadopago.com.ar/developers',
                'Servidor',
                'Ninguna tienda puede conectar cobros',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Recomendables',
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Para qué'],
            rows: [
              [
                'Resend: webhook de rebotes',
                'resend.com → Webhooks',
                'Servidor',
                'Sacar solos de las campañas los emails que rebotan',
              ],
              [
                'Cloudflare Turnstile',
                'dash.cloudflare.com',
                'Servidor',
                'Frenar bots en los formularios públicos',
              ],
              ['Sentry', 'sentry.io', 'Servidor', 'Enterarse de los errores antes que el cliente'],
            ],
          },
        ],
      },
      {
        heading: 'Opcionales, según qué se use',
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Habilita'],
            rows: [
              [
                'Mercado Libre: app',
                'developers.mercadolibre.com.ar',
                'Servidor',
                'El canal de Mercado Libre',
              ],
              ['Meta: app', 'developers.facebook.com', 'Servidor', 'Publicar en Facebook e Instagram'],
              ['X: app', 'developer.x.com', 'Servidor', 'Publicar en X'],
              ['Meta Ads', 'developers.facebook.com', 'Servidor', 'El retorno real de la publicidad'],
              [
                'Google OAuth',
                'console.cloud.google.com',
                'Servidor',
                'Que los compradores entren con Google',
              ],
              ['Clave de IA', 'console.anthropic.com', 'Servidor', 'Sugerencias de textos y respuestas'],
            ],
          },
        ],
      },
      {
        heading: 'Lo que carga cada comercio desde el panel',
        paragraphs: ['Nada de esto pasa por el servidor. Se guarda cifrado y cada tienda ve solo lo suyo.'],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga en el panel'],
            rows: [
              ['Mercado Pago del comercio', 'Su propia cuenta (un click)', 'Configuración → Medios de pago'],
              ['Payway', 'Ejecutivo comercial de Payway', 'Configuración → Medios de pago'],
              [
                'Mercado Libre del comercio',
                'Su cuenta de vendedor (un click)',
                'Configuración → Mercado Libre',
              ],
              ['Correo Argentino', 'Cuenta de MiCorreo', 'Configuración → Medios de envío'],
              ['Zipnova', 'Panel de Zipnova → Integraciones', 'Configuración → Medios de envío'],
              ['Andreani', 'Ejecutivo comercial de Andreani', 'Configuración → Medios de envío'],
              ['Certificado de ARCA', 'ARCA con clave fiscal', 'Configuración → Facturación'],
              ['WhatsApp', 'App propia en Meta', 'Configuración → WhatsApp automático'],
              ['Telegram', 'Bot creado con @BotFather', 'Redes sociales → Cuentas'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'WhatsApp es la excepción entre las de Meta: no usa app de plataforma. Cada comercio arma la suya, con su propio número.',
          },
        ],
      },
      {
        heading: 'Reglas sobre los secretos',
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Los secretos de plataforma (client secrets, webhook secrets, claves de API) van en variables de entorno del servidor. Nunca en el panel, nunca en el navegador, nunca en el repositorio.',
          },
          {
            type: 'callout',
            tone: 'warning',
            title: 'Lo que más duele perder',
            text: 'Todos los secretos de cada tienda —certificados de ARCA, tokens de Mercado Pago y Mercado Libre, WhatsApp, MiCorreo, Zipnova, Payway, Andreani— están cifrados con las claves del volumen dpkeys del servidor. Si ese volumen se pierde, CADA tienda tiene que reconectar todo de cero. Verificá que esté dentro del backup diario.',
          },
        ],
      },
    ],
  },

  plataformaTramites: {
    title: 'Trámites y altas con proveedores',
    intro:
      'Lo que no se resuelve con código: qué hay que gestionar con cada proveedor, cuánto suele tardar y qué te entregan al final.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Arrancar los lentos primero',
        paragraphs: [
          'Casi todo se resuelve en un rato. Las excepciones son las que tienen una persona del otro lado, y son justo las que conviene empezar antes de prometer una fecha.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Trámite', 'Con quién', 'Suele tardar', 'Qué te dan'],
            rows: [
              [
                'Alta comercial de Andreani',
                'Ejecutivo comercial',
                'Semanas',
                'Usuario, contraseña y números de contrato',
              ],
              [
                'Alta y certificación de Payway',
                'Ejecutivo comercial',
                'Semanas',
                'Site ID, las dos claves y la habilitación para cobrar',
              ],
              [
                'App de Meta aprobada',
                'Revisión de Meta',
                'Días a semanas',
                'App ID y App Secret con permisos',
              ],
              ['Certificado de ARCA', 'ARCA con clave fiscal', 'Días', 'Certificado y punto de venta'],
              ['Cuenta de MiCorreo', 'Correo Argentino', 'Días', 'Credenciales de prueba y de producción'],
              ['Cuenta de Zipnova', 'Alta en su web', 'Horas', 'API Token, Secret y número de cuenta'],
            ],
          },
        ],
      },
      {
        heading: 'Payway: qué pedir y qué confirmar',
        steps: [
          'Pedir el alta del comercio. No hay registro autogestionado ni ambiente de pruebas abierto.',
          'Pedir credenciales de prueba propias: las que figuran en su documentación sirven para desarrollar, no para el comercio real.',
          'Pasar la certificación. Revisan la integración antes de habilitar el cobro en producción.',
          'Confirmar POR ESCRITO el host de producción y la tabla de medios de pago vigente para el comercio.',
          'Acordar las promociones y planes de cuotas, y con qué costo financiero.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Dos datos que Payway no publica de forma consistente',
            text: 'Sus propios kits de desarrollo no coinciden en el host de producción, y circulan dos tablas distintas de códigos de medio de pago (Mastercard figura como 15 en una y como 104 en otra). Las dos se corrigen desde el panel sin publicar una versión nueva, pero hay que confirmarlas antes del primer cobro real.',
          },
        ],
      },
      {
        heading: 'Andreani: qué pedir y qué confirmar',
        steps: [
          'Alta comercial y contratos. Pedir los dos si se van a ofrecer las dos modalidades: entrega a domicilio y retiro en sucursal son contratos distintos.',
          'Preguntar si aplican restricción por IP. Si aplica, informarles la IP de salida del servidor: sin eso la API responde 403 aunque las credenciales estén bien.',
          'Pedir que habiliten el seguimiento para el usuario. Es una habilitación aparte, no viene con las credenciales.',
          'Pedir la tabla completa de estados y motivos de envío.',
          'Confirmar el coeficiente de peso aforado del contrato.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'La cotización de Andreani funciona sin credenciales: se puede dejar el checkout cotizando mientras el alta avanza, y sumar el despacho cuando lleguen los accesos.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Antes de habilitarlo a un comercio, imprimir una etiqueta real en su impresora y escanear el código con un lector. Andreani solo entrega la etiqueta en PDF: si el comercio usa impresora térmica, el código puede salir ilegible y eso recién se descubre en el depósito.',
          },
        ],
      },
      {
        heading: 'Mercado Pago y Mercado Libre: registrar las apps',
        paragraphs: [
          'Son las dos que sí necesitan configuración del servidor, porque el botón de “conectar tu cuenta” usa una aplicación registrada a nombre de la plataforma. Van en portales distintos y una no sirve para la otra, aunque sean la misma empresa.',
        ],
        steps: [
          'Crear la aplicación en el portal que corresponda. En Mercado Pago tiene que ser con modelo marketplace, que es el que permite operar en nombre de otros vendedores.',
          'Cargar la URL de retorno del OAuth apuntando a la API pública. En desarrollo hace falta un túnel, porque el portal no acepta direcciones locales.',
          'Configurar el webhook: en Mercado Pago el de pagos con su secreto; en Mercado Libre las notificaciones del tema de órdenes.',
          'Cargar las claves en la configuración del servidor y reiniciar la API.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Sin el webhook de pagos, una compra que el comprador abandona a mitad de camino puede quedar sin impactar en la orden aunque el pago se haya acreditado.',
          },
        ],
      },
      {
        heading: 'ARCA: el circuito del certificado',
        paragraphs: [
          'Es de nivel tienda, no de plataforma, pero lo suele hacer alguien con conocimiento técnico y conviene tenerlo mapeado. El asistente del panel guía el paso a paso.',
        ],
        steps: [
          'Generar el pedido de certificado desde el panel de la tienda.',
          'Subirlo a ARCA con clave fiscal, en Administración de Certificados Digitales.',
          'Descargar el certificado que emite ARCA y cargarlo en el panel.',
          'Crear el punto de venta en ARCA con sistema “Web Services” y cargar ese número en el panel.',
          'Probar en homologación y recién después pasar a producción.',
        ],
      },
    ],
  },

  integracionesProduccion: {
    title: 'Checklist antes de cobrar y despachar de verdad',
    intro:
      'Lo último que hay que verificar de cada integración antes de que un comprador real ponga su tarjeta.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Cobros',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Mercado Pago: cuenta conectada y una compra real de monto chico, aprobada y devuelta',
              'Mercado Pago: el webhook llega — probado cerrando el navegador antes de volver a la tienda',
              'Payway: credenciales de producción y ambiente cambiado a “Producción”',
              'Payway: host de producción y tabla de medios de pago confirmados por escrito',
              'Payway: un cobro real hecho y devuelto',
              'El nombre que aparece en el resumen de la tarjeta es el correcto',
            ],
          },
        ],
      },
      {
        heading: 'Envíos',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Cada carrier activo cotiza en el checkout, probado con códigos postales de zonas distintas',
              'Un envío de prueba generado de punta a punta, con su etiqueta descargada',
              'La etiqueta impresa en la impresora real del comercio y escaneada con un lector',
              'Los datos del remitente completos: sin eso se puede cotizar pero no despachar',
              'El paquete por defecto refleja lo que el comercio manda de verdad',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'El paquete por defecto no es un detalle: si las medidas cargadas son más grandes que las reales se le cotiza de más al comprador, y si son más chicas la diferencia la paga el comercio.',
          },
        ],
      },
      {
        heading: 'Facturación y emails',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Certificado de producción de ARCA, no el de homologación',
              'Una factura de prueba emitida y verificada en el portal de ARCA',
              'Dominio del remitente verificado en Resend',
              'Un email de confirmación de compra recibido en una casilla real, fuera de spam',
              'El webhook de rebotes configurado',
            ],
          },
        ],
      },
      {
        heading: 'Cuando algo no anda',
        blocks: [
          {
            type: 'table',
            headers: ['Síntoma', 'Causa más probable'],
            rows: [
              [
                'El botón de conectar Mercado Pago no hace nada',
                'Falta la app de plataforma o la URL de retorno',
              ],
              ['Los pagos se aprueban pero la orden queda pendiente', 'El webhook no llega a la API'],
              ['Payway responde que no está autorizado', 'Credenciales de prueba en producción, o al revés'],
              ['Andreani responde 403 con credenciales correctas', 'La IP del servidor no está habilitada'],
              ['Andreani no muestra el seguimiento', 'Falta la habilitación específica para ese usuario'],
              ['Los emails no llegan', 'El dominio del remitente no está verificado'],
              ['Las facturas quedan en error', 'Certificado de homologación cargado en producción'],
              ['Una tienda nueva no abre en su subdominio', 'Falta el registro comodín en el DNS'],
            ],
          },
        ],
      },
    ],
  },

  plataformaOperacion: {
    title: 'Mantener la plataforma andando',
    intro: 'Backups, certificados y las señales que conviene mirar antes de que las reporte un cliente.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'El backup que realmente importa',
        paragraphs: ['La base de datos es lo obvio. Lo que se olvida es el volumen de claves de cifrado.'],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Si se pierde'],
            rows: [
              ['Base de datos', 'Se pierde todo: catálogo, ventas, clientes'],
              ['Volumen dpkeys', 'Cada tienda tiene que reconectar TODAS sus integraciones de cero'],
              ['Almacenamiento de imágenes', 'El catálogo queda sin fotos'],
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Un backup que nunca se restauró no es un backup. Probá la restauración completa en un entorno aparte, al menos una vez.',
          },
        ],
      },
      {
        heading: 'Certificados y dominios',
        paragraphs: [
          'El proxy emite y renueva los certificados solo, también para los dominios propios de cada tienda: la primera visita al dominio dispara la emisión. No hay renovación manual.',
          'Lo que sí puede fallar es lo de afuera: que el comercio no haya creado el registro en su DNS, o que le venza el dominio y deje de resolver.',
        ],
      },
      {
        heading: 'Qué mirar seguido',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Ventas cobradas que quedaron sin confirmar: pueden ser webhooks que no llegan',
              'Facturas en error: suele ser el certificado o el punto de venta',
              'Emails rebotados en aumento: puede ser el dominio del remitente',
              'Integraciones marcadas “Reconectar”: un token que la red revocó',
              'Espacio en disco del servidor y del almacenamiento de imágenes',
            ],
          },
        ],
      },
      {
        heading: 'Sumar una tienda nueva',
        steps: [
          'Crearla desde Mis tiendas. El subdominio funciona solo si el DNS comodín está puesto.',
          'Cargar a su dueño en Usuarios y permisos, y agregar un segundo dueño.',
          'Conectar el cobro y configurar al menos un medio de envío.',
          'Cargar el certificado de facturación, si va a facturar.',
          'Apuntar el dominio propio, si tiene.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Las credenciales de las tiendas no se comparten entre sí, aunque sean de la misma empresa. Cada una conecta sus propias cuentas.',
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
