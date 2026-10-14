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
            tone: 'info',
            text: 'No hace falta configurar nada más: las direcciones de ARCA, tanto las de prueba como las de producción, ya vienen puestas.',
          },
        ],
      },
      {
        heading: 'Paso 3 — Puntos de venta',
        paragraphs: [
          'El punto de venta es el “talonario” numerado de tus facturas (el 0001 de “0001-00000123”). Se crea en ARCA: “Administración de puntos de venta y domicilios”, con el sistema de facturación “Web Services”. Después cargás ese número en el panel.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Tiene que ser de Web Services, no cualquiera',
            text: 'Al crearlo, el sistema tiene que ser “RECE para aplicativo y web services”. Los puntos de venta de “Comprobantes en línea” (los que usás para facturar a mano en la web de ARCA) y los de controlador fiscal NO sirven, y el error que da ARCA al usar uno de esos no menciona el punto de venta por ningún lado. El paso “Probar la conexión” lo verifica por vos.',
          },
        ],
      },
      {
        heading: 'Paso 4 — Probar la conexión',
        paragraphs: [
          'El botón “Probar conexión con ARCA” revisa, sin emitir nada, todo lo que se puede revisar antes de la primera factura: que el certificado esté cargado y de quién es, que ARCA entregue el ticket de acceso, que acepte al CUIT que factura y que los puntos de venta sean de Web Services.',
          'Lo que NO puede ver: si ARCA te deja emitir. La situación fiscal del contribuyente se valida recién al facturar, así que alguien con el monotributo dado de baja pasa todos los pasos en verde y falla con la primera factura. La prueba final siempre es una factura real.',
        ],
      },
      {
        heading: 'Paso 5 — Preferencias de emisión',
        paragraphs: [
          'Con “Facturar automáticamente cada venta” (recomendado) elegís cuándo se factura: al acreditarse el pago o al despachar el pedido. También definís el punto de venta por defecto.',
          'Por encima del umbral de ARCA para consumidor final (hoy $10.000.000, RG 5.700/2025) la factura exige el DNI o CUIT del comprador. No hace falta configurarlo: el sistema ya lo tiene, y si vendés montos así, pedí el DNI/CUIT como obligatorio en Opciones del checkout.',
        ],
      },
      {
        heading: 'Facturar una venta a mano',
        paragraphs: [
          'Si una venta no se facturó sola (la facturación automática estaba apagada, o es una venta vieja), abrí la venta y en el recuadro “Facturación (ARCA)” tocá “Facturar ahora”. Si la automática falló, el botón es “Reintentar”, y “PDF” descarga la factura o la nota de crédito.',
          'En el diálogo cargás el DNI o CUIT del comprador (vacío = consumidor final sin identificar). Con un CUIT, “Consultar en ARCA” trae del padrón el nombre, el domicilio y la condición frente al IVA, y con eso sale el tipo de factura correcto. Si no elegís condición, a una sociedad le sale Factura A y a una persona, B.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'El número solo no alcanza: un CUIL y el CUIT de un monotributista tienen la misma forma. Por eso, sin otro dato, a una persona se la factura como consumidor final. Si es Responsable Inscripto y te pide Factura A, tocá “Consultar en ARCA” o elegí su condición antes de facturar.',
          },
        ],
      },
      {
        heading: 'Ventas de Mercado Libre',
        paragraphs: [
          'Las ventas que llegan de Mercado Libre también se facturan desde acá. En Configuración → Mercado Libre, “Facturar automáticamente las ventas de ML” emite el comprobante de cada venta pagada, a consumidor final. Si está apagado, o ARCA rechazó alguna, en Canales de venta → Mercado Libre → Ventas tenés el botón “Facturar” en cada una, y las ya facturadas se marcan “Facturada”.',
        ],
      },
      {
        heading: 'Libro de IVA ventas',
        paragraphs: [
          'Arriba de la pantalla de Facturación elegís el mes y tocás “Libro IVA ventas”: se descarga un CSV, listo para Excel, con todos los comprobantes aprobados del mes (fecha, tipo, punto de venta, número, documento del comprador, neto, IVA, total y CAE). Es lo que te pide tu contador.',
          'El de compras sale de Compras e importaciones, con el botón “Libro IVA compras”.',
        ],
      },
      {
        heading: 'Probar y pasar a Producción',
        steps: [
          'Con todo configurado en Homologación, hacete una compra de prueba y verificá que la venta muestre su factura con CAE.',
          'Descargá el PDF desde el detalle de la venta (recuadro “Facturación (ARCA)”).',
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
          'Las facturas aprobadas no se borran (ARCA no lo permite): se compensan con una Nota de Crédito, la “factura al revés”. Si reembolsás una venta facturada y queda devuelta del todo, Tiendafy la emite automáticamente — el círculo fiscal queda cerrado sin trámites manuales.',
        ],
      },
      {
        heading: 'Si ARCA no contesta: nunca dos facturas para la misma venta',
        paragraphs: [
          'A veces el pedido de factura llega a ARCA, ARCA la autoriza, y la respuesta se pierde en el camino (un corte, un timeout). Reintentar a ciegas en ese caso emitiría una SEGUNDA factura con CAE para la misma venta, que después habría que anular con una nota de crédito.',
          'Por eso Tiendafy guarda cada pedido ANTES de mandarlo. Si la respuesta no llega, la venta muestra “Esperando confirmación de ARCA”, y antes de volver a intentar le pregunta a ARCA si ese comprobante quedó autorizado: si quedó, lo adopta con su CAE; si no, emite con el mismo número. Mientras tanto no aparece el botón “Facturar ahora”, justamente para no duplicarla.',
        ],
      },
      {
        heading: 'Los errores de ARCA que no dicen lo que parecen',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Error 600 — “No apareció CUIT en lista de relaciones”',
                def: 'ARCA usa el mismo error para dos cosas distintas: que el CUIT que factura no tenga relación con el certificado (no le delegó el servicio), o que la relación exista pero el contribuyente esté inhabilitado para facturar — por ejemplo, un monotributo dado de baja por deuda. Si el trámite está bien hecho y el error sigue, revisá el estado del contribuyente en ARCA.',
              },
              {
                term: '“El CEE ya posee un TA válido” (alreadyAuthenticated)',
                def: 'ARCA entrega un ticket de acceso que dura hasta 12 horas y no da otro mientras ese siga vigente. Tiendafy lo guarda y lo reusa, así que esto solo aparece si el mismo certificado se usa en otro sistema a la vez. No lo compartas: cada sistema, su propio certificado.',
              },
              {
                term: 'Rechazo por observaciones',
                def: 'ARCA manda los motivos de rechazo en dos listas, errores y observaciones, y un comprobante puede rebotar por cualquiera de las dos. El panel muestra las dos juntas, así que un rechazo nunca queda “sin detalle”.',
              },
              {
                term: '“DocNro no puede ser igual al del emisor”',
                def: 'Alguien intentó facturarse a sí mismo — lo típico es probar la tienda con el CUIT de la propia empresa. Tiendafy lo frena antes de mandarlo, con un mensaje en castellano.',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Certificado de otro CUIT (delegación)',
            text: 'Si el certificado es de un CUIT y la tienda factura con otro (por ejemplo, el del estudio contable emitiendo para la empresa), el que factura tiene que delegarle el servicio “Facturación Electrónica” al titular del certificado en el Administrador de Relaciones de ARCA. El paso “Probar la conexión” te avisa cuando los dos CUIT no coinciden.',
          },
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
          'La Resolución 104/2005 de Defensa del Consumidor exige mostrar email, dirección y teléfono reales. Cargalos en el editor de diseño (Canales de venta → Tienda online): en el panel Contacto, para la página de Contacto, y en Pie de página → Contacto en el pie, para el pie de tu tienda.',
        ],
      },
      {
        heading: 'Botón de arrepentimiento',
        paragraphs: [
          'La Resolución 424/2020 obliga a ofrecer un “Botón de Arrepentimiento” accesible desde la home: el comprador puede revocar la compra dentro de los 10 días corridos de recibida, sin costo.',
          'Tu tienda ya lo incluye automáticamente en el pie de página. Cuando un cliente lo usa: la solicitud llega a Mensajes de contacto marcada con la etiqueta roja “Arrepentimiento” (la solapa “Arrepentimientos” las junta), el comprador recibe un email de acuse con su número de constancia, y si informó un número de pedido válido, el mensaje trae el link “Ver venta (reembolsar desde ahí)” para hacer el reembolso en el momento.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Las solicitudes de arrepentimiento tienen plazo legal: atendelas primero. La solapa “Arrepentimientos” de Mensajes de contacto existe para que ninguna se pierda entre las consultas comunes, y en Inicio, “Para hacer hoy” muestra las que siguen sin leer con los días que quedan (el panel cuenta 10 días corridos desde la solicitud). Si el comprador no dejó número de pedido, el mensaje trae un link a sus compras, buscadas por su email.',
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
                'Ya está en el pie de tu tienda; las solicitudes llegan a Mensajes de contacto',
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
              [
                'Precio sin impuestos nacionales',
                'Ley 27.743 y Res. SIC 4/2025',
                'Sale solo debajo de cada precio; revisá tu condición en Configuración → Datos legales',
              ],
              [
                'Quién vende y QR de Data Fiscal',
                'Ley 24.240 y ARCA',
                'Cargalos en Datos legales y aparecen en el pie de la tienda',
              ],
            ],
          },
        ],
      },
    ],
  },

  datosLegales: {
    title: 'Datos legales y precio sin impuestos nacionales',
    intro:
      'Quién vende (razón social, CUIT, domicilio y el QR de Data Fiscal) y la leyenda “Precio sin impuestos nacionales” que pide la ley debajo de cada precio.',
    category: 'Legal y facturación',
    keywords: [
      'transparencia fiscal',
      'IVA contenido',
      'precio neto',
      'data fiscal',
      'qr afip',
      'cuit en el pie',
    ],
    sections: [
      {
        heading: 'Dónde se cargan',
        blocks: [{ type: 'path', segments: ['Configuración', 'Datos legales'] }],
        paragraphs: [
          'Si ya configuraste la facturación electrónica, la razón social, el CUIT y la condición se toman de ahí mientras no cargues otros: no hace falta escribirlos dos veces.',
        ],
      },
      {
        heading: 'Quién vende, en el pie de la tienda',
        paragraphs: [
          'La razón social, el CUIT y el domicilio aparecen en el renglón legal del pie, junto a los links de Términos, Privacidad y el Botón de arrepentimiento.',
          'El QR de “Data Fiscal” lo da ARCA con tu clave fiscal (formulario 960/D). Podés pegar el link del QR o subir la imagen: si cargás los dos, se ve la imagen y al tocarla abre el link.',
        ],
      },
      {
        heading: 'Precio sin impuestos nacionales',
        paragraphs: [
          'La Ley 27.743 creó el régimen de transparencia fiscal al consumidor, y la Resolución 4/2025 de la Secretaría de Industria y Comercio pide mostrar, debajo del precio final y con letra más chica, el precio sin IVA ni otros impuestos nacionales indirectos. La tienda lo hace sola en la ficha de cada producto y en los listados.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Condición', 'Cómo se calcula', 'Ejemplo con un precio de $12.100'],
            rows: [
              ['Responsable Inscripto (IVA 21 %)', 'Precio ÷ 1,21', '$10.000'],
              ['Responsable Inscripto (IVA 10,5 %)', 'Precio ÷ 1,105', '$10.950'],
              ['Monotributo', 'No discrimina IVA: el mismo precio', '$12.100'],
              ['Exento', 'No cobra IVA: el mismo precio', '$12.100'],
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            title: 'Confirmalo con tu contador',
            text: 'La alícuota es una sola para toda la tienda: si vendés productos con IVA distinto (10,5 % y 21 %) elegí la que corresponde a la mayoría y consultá cómo informar el resto. Si sos monotributista, preguntale si te conviene mostrar la leyenda (con el mismo precio) o apagarla. Impuestos internos u otros nacionales se suman en “Otros impuestos nacionales”.',
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
