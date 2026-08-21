import type { HelpArticle } from './helpContent';

/**
 * Guías para quien administra la plataforma, no para quien vende.
 *
 * El resto del centro de ayuda está escrito para el comerciante: qué botón
 * tocar y qué esperar. Acá va lo otro — lo que hay que gestionar por fuera del
 * panel (altas comerciales, certificaciones, claves del servidor) y que si
 * falta, hace que una integración no funcione por más que la pantalla se vea
 * bien.
 */
export const PLATAFORMA = {
  integracionesProduccion: {
    title: 'Poner las integraciones en producción',
    intro:
      'Qué hay que gestionar por fuera del panel para que cada integración cobre, despache o facture de verdad. Guía técnica, para quien administra la plataforma.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Dos niveles: la plataforma y cada tienda',
        paragraphs: [
          'Algunas integraciones se configuran una sola vez para todo Tiendafy, y otras se cargan tienda por tienda desde el panel. Confundirlos es la causa más común de "lo configuré y no anda".',
          'Lo de plataforma vive en la configuración del servidor y necesita reiniciar la API. Lo de cada tienda lo carga el dueño desde Configuración, sin tocar nada del servidor.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Integración', 'Nivel plataforma (una vez)', 'Nivel tienda (cada una)'],
            rows: [
              [
                'Mercado Pago',
                'App marketplace, redirect URI, webhook secret',
                'Conectar la cuenta por OAuth',
              ],
              ['Mercado Libre', 'App de ML con su redirect URI', 'Conectar la cuenta por OAuth'],
              ['Payway', '— nada', 'Site ID y las dos claves'],
              ['Andreani', '— nada', 'Usuario, contraseña y contratos'],
              ['Correo Argentino', '— nada', 'Credenciales de MiCorreo'],
              ['Zipnova', '— nada', 'API Token y Secret'],
              ['ARCA (facturación)', '— nada', 'Certificado, CUIT y punto de venta'],
              ['Redes sociales', 'Apps de Meta y X', 'Conectar cada cuenta'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Payway, Andreani, Correo Argentino y Zipnova no necesitan NADA a nivel plataforma: las credenciales son de cada comercio. Lo que sí necesitan es que alguien haga el alta comercial con el proveedor, y eso lleva tiempo de calendario.',
          },
        ],
      },
      {
        heading: 'Lo que se pide con anticipación',
        paragraphs: [
          'Estas son las gestiones que no dependen de nosotros y que conviene arrancar antes de prometer una fecha.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Con quién', 'Cuánto suele tardar'],
            rows: [
              ['Alta comercial de Andreani', 'Ejecutivo comercial de Andreani', 'Semanas'],
              ['Alta y certificación de Payway', 'Ejecutivo comercial de Payway', 'Semanas'],
              ['Certificado de producción de ARCA', 'ARCA (ex AFIP), con clave fiscal', 'Días'],
              ['Cuenta de MiCorreo', 'Correo Argentino', 'Días'],
              ['App de Meta aprobada', 'Revisión de Meta', 'Días a semanas'],
            ],
          },
        ],
      },
      {
        heading: 'Payway: qué falta antes de cobrar de verdad',
        steps: [
          'Pedir el alta del comercio. No hay registro autogestionado ni sandbox abierto: se hace con un ejecutivo.',
          'Pedir credenciales de prueba propias. Las que aparecen en la documentación de Payway sirven para desarrollar, no para el comercio real.',
          'Pasar la certificación: Payway revisa la integración antes de habilitar el cobro en producción.',
          'Confirmar POR ESCRITO cuál es el host de producción y cuál es la tabla de medios de pago vigente para el comercio.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Dos datos que Payway no publica de forma consistente',
            text: 'Sus propios kits de desarrollo no coinciden en el host de producción, y circulan dos tablas distintas de códigos de medio de pago (Mastercard figura como 15 en una y como 104 en otra). Las dos cosas se pueden corregir desde el panel sin publicar una versión nueva: el host tiene un campo propio y el código usado queda guardado en cada intento de cobro. Pero hay que confirmarlas antes del primer cobro real.',
          },
          {
            type: 'checklist',
            items: [
              'Credenciales de producción cargadas y ambiente cambiado a “Producción”',
              'Host de producción confirmado por escrito',
              'Tabla de medios de pago confirmada para el site',
              'Un cobro de prueba real hecho y devuelto',
            ],
          },
        ],
      },
      {
        heading: 'Andreani: qué falta antes de despachar',
        steps: [
          'Alta comercial y contratos. Pedir los dos: entrega a domicilio y retiro en sucursal, si se van a ofrecer los dos.',
          'Preguntar si aplican restricción por IP. Si aplica, hay que informarles la IP de salida del servidor — de lo contrario la API responde 403 aunque las credenciales estén bien.',
          'Pedir que habiliten el seguimiento para el usuario: es una habilitación aparte, no viene con las credenciales.',
          'Pedir la tabla completa de estados y motivos. Sin ella, el panel muestra “Sin novedades” en todo lo que no reconoce.',
          'Confirmar el coeficiente de peso aforado del contrato y cargarlo en la tienda.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'La cotización funciona sin credenciales: se puede dejar el checkout cotizando con Andreani mientras el alta comercial avanza, y sumar el despacho cuando lleguen los accesos.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Antes de habilitarlo a un comercio, imprimir una etiqueta real en su impresora y escanear el código con un lector. Andreani solo entrega la etiqueta en PDF: si el comercio usa impresora térmica, el código puede salir ilegible y eso recién se descubre en el depósito.',
          },
        ],
      },
      {
        heading: 'Mercado Pago y Mercado Libre: la parte de plataforma',
        paragraphs: [
          'Estas dos sí necesitan configuración del servidor, porque el botón de "conectar tu cuenta" usa una aplicación registrada a nombre de la plataforma.',
        ],
        steps: [
          'Registrar la aplicación en el portal de desarrolladores correspondiente, con modelo marketplace en el caso de Mercado Pago.',
          'Cargar la URL de retorno del OAuth apuntando a la API pública.',
          'Configurar el webhook con su secreto: sin eso, un pago hecho fuera del navegador puede no llegar a impactar la orden.',
          'Cargar las claves en la configuración del servidor y reiniciar la API.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'El detalle exacto de cada clave está en docs/CONFIGURACION.md del repositorio. Acá va el qué y el porqué; el nombre puntual de cada variable vive con el código, que es donde se actualiza.',
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
              'Facturación de ARCA con el certificado de producción, no el de pruebas',
              'Emails automáticos funcionando: el dominio del remitente verificado',
              'Dominio propio apuntado y con certificado',
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
              [
                'Payway responde que no está autorizado',
                'Credenciales de prueba en ambiente de producción, o al revés',
              ],
              ['Andreani responde 403 con credenciales correctas', 'La IP del servidor no está habilitada'],
              ['Andreani no muestra el seguimiento', 'Falta la habilitación específica para ese usuario'],
              ['Los emails no llegan', 'El dominio del remitente no está verificado'],
              ['Las facturas quedan en error', 'Certificado de pruebas cargado en producción'],
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
