import type { HelpArticle } from './helpContent';

export const LEGAL = {
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
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            title: 'Para quien administra la plataforma: backup de dpkeys',
            text: 'Todos los secretos por tienda (certificados ARCA, tokens de Mercado Pago/Libre, WhatsApp, MiCorreo, Zipnova) están cifrados con las claves del volumen dpkeys del servidor. Si ese volumen se pierde, CADA tienda tiene que reconectar todo de cero. Verificá que esté dentro del backup diario. Lo demás no requiere nada: las URLs de ARCA (homologación y producción) ya vienen configuradas.',
          },
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
          'Tu tienda ya lo incluye automáticamente en el pie de página. Cuando un cliente lo usa: la solicitud llega a Mensajes marcada con la etiqueta roja “Arrepentimiento” (hay un filtro para verlas juntas), el comprador recibe un email de acuse con su número de constancia, y si informó un número de pedido válido, el mensaje trae el botón “Ver venta” para hacer el reembolso ahí mismo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Las solicitudes de arrepentimiento tienen plazo legal: atendelas primero. El filtro “Arrepentimientos” de Mensajes existe para que ninguna se pierda entre las consultas comunes.',
          },
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
} satisfies Record<string, HelpArticle>;
