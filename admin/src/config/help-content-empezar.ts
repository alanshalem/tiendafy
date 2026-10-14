import type { HelpArticle } from './helpContent';

export const EMPEZAR = {
  primerosPasos: {
    title: 'Abrí tu tienda en 7 pasos',
    intro: 'Todo lo que necesitás para pasar de cero a vender, en orden.',
    category: 'Empezar',
    sections: [
      {
        heading: 'El camino completo',
        steps: [
          'Diseñá tu tienda: en Canales de venta → Tienda online arrancá con “Elegí un diseño listo” o una plantilla de inicio, subí tu logo (también aparece en los emails que reciben tus clientes) y seguí la guía “Poné tu tienda linda”. Acordate de tocar “Publicar cambios”.',
          'Cargá tus productos: en Productos → Agregar, con fotos, precio, variantes, stock y el peso y las medidas para que los correos coticen bien. Si tenés muchos, usá la importación por CSV.',
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
        heading: '¿Administrás la plataforma además de la tienda?',
        paragraphs: [
          'Varias integraciones tienen dos niveles: una app o credencial de PLATAFORMA que se configura una sola vez en el servidor, y la conexión de cada tienda desde el panel. Si un botón de conectar avisa que “falta configuración”, casi seguro falta el nivel plataforma.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Integración', 'Nivel plataforma (una vez)', 'Nivel tienda'],
            rows: [
              ['Mercado Pago', 'App marketplace (Client ID/Secret + webhook)', 'OAuth con un click'],
              ['Mercado Libre', 'App de desarrolladores (Client ID/Secret + webhook)', 'OAuth con un click'],
              [
                'Emails (Resend)',
                'API key + dominio verificado + webhook de rebotes',
                'Solo editar plantillas',
              ],
              ['WhatsApp', '— (no tiene)', 'App de Meta propia por tienda'],
              ['ARCA', '— (URLs ya incluidas)', 'Certificado + punto de venta por tienda'],
              [
                'Payway, Correo Argentino, Zipnova y Andreani',
                '— (no tienen)',
                'Credenciales por tienda, cifradas',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Todo lo de plataforma está junto en el centro de ayuda, en la categoría “Administrar la plataforma”: qué levantar y en qué orden, el inventario completo de credenciales y los trámites con cada proveedor.',
          },
        ],
      },
      {
        heading: 'Moverte rápido por el panel',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Ctrl+K (⌘K en Mac) abre el buscador del panel: escribí el nombre de una pantalla o de un producto y vas directo.',
              'En Inicio, la tarjeta “Para hacer hoy” junta lo que necesita tu atención, cada cosa con su link al listado ya filtrado: arrepentimientos sin atender (con los días que quedan del plazo), ventas para despachar, transferencias por confirmar, preguntas de Mercado Libre sin responder, mensajes de contacto sin leer, ventas de Mercado Libre sin facturar, productos que se agotan antes del próximo embarque, ventas sin costo cargado, redes para reconectar y posts que fallaron.',
              'Los listados recuerdan la búsqueda, el filtro y la página en la dirección: si recargás o volvés atrás no perdés dónde estabas, y podés pasarle el link a alguien del equipo.',
              'Si salís de un formulario con cambios sin guardar, el panel te pregunta antes de descartarlos.',
              'Si se te vence la sesión, el panel te pide la contraseña encima de la pantalla en la que estabas, sin sacarte de ahí.',
              'El panel se usa también desde el celular, incluido el editor de diseño.',
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
  glosario: {
    title: 'Glosario',
    intro:
      'Las palabras del sistema explicadas en criollo. Si algo del panel no se entiende, empezá por acá.',
    category: 'Empezar',
    sections: [
      {
        heading: 'Ventas y plata',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Ticket promedio',
                def: 'Facturación ÷ cantidad de ventas: cuánto gasta en promedio cada comprador.',
              },
              {
                term: 'Margen',
                def: '(Precio − costo) ÷ precio. Si vendés a $10.000 algo que te costó $7.000, el margen es 30%.',
              },
              {
                term: 'Ganancia real',
                def: 'Ventas − costo de lo vendido − comisiones. Lo que de verdad te queda, no lo que facturás.',
              },
              {
                term: 'ROAS',
                def: 'Retorno de la pauta: cuánto te vuelve por cada peso invertido en publicidad. El "ROAS real" del panel usa la GANANCIA (no la facturación), por eso da más bajo que el número de Meta.',
              },
              {
                term: 'Comisión / fee',
                def: 'Lo que se queda la pasarela (Mercado Pago) o el marketplace (ML) por cada venta.',
              },
              {
                term: 'Contracargo',
                def: 'El comprador desconoció el pago ante su tarjeta y el dinero se devuelve. Se disputa con evidencia de entrega.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Tu tienda online',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Borrador / Publicar',
                def: 'Lo que cambiás en el editor de diseño se guarda solo en un borrador que ven solo vos y tu equipo. Tus clientes lo ven recién cuando tocás “Publicar cambios”.',
              },
              {
                term: 'Sección',
                def: 'Cada bloque de la página de inicio: un carrusel, una grilla de productos, preguntas frecuentes, un pop-up. El inicio se arma apilando secciones.',
              },
              {
                term: 'Precio tachado',
                def: 'El precio anterior que se muestra tachado al lado del actual. Un producto con precio tachado cuenta como “en oferta” en toda la tienda.',
              },
              {
                term: 'Pop-up',
                def: 'Una ventana que aparece encima de la página con una promo o un cupón. Nunca aparece en el checkout.',
              },
              {
                term: 'UTM',
                def: 'Una marca que se agrega al final de un link (?utm_source=instagram) para que las estadísticas sepan de dónde vino cada visita y cada venta.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Stock y depósito',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Variante',
                def: 'Cada versión vendible de un producto: la remera talle M negra es una variante; la L blanca, otra.',
              },
              {
                term: 'SKU',
                def: 'El código interno de cada variante (ej. REM-M-NEG). Lo inventás vos; sirve para buscar y escanear.',
              },
              {
                term: 'EAN / código de barras',
                def: 'El código impreso del fabricante. Se escanea con la cámara del celu en el Escáner.',
              },
              {
                term: 'Reservado',
                def: 'Stock apartado por un checkout en curso. Si el pago no llega en 30 minutos, vuelve solo a disponible.',
              },
              {
                term: 'Kit / combo',
                def: 'Un producto compuesto por otros ("Kit barra + discos"): al venderse, descuenta el stock de cada pieza.',
              },
              {
                term: 'Picking',
                def: 'Juntar los productos de un pedido en el depósito. El picking verificado exige escanear cada uno para no despachar mal.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Importaciones',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'FOB',
                def: 'Lo que cobra el proveedor por la mercadería puesta en el barco, sin flete, seguro ni impuestos.',
              },
              {
                term: 'Landed cost',
                def: 'El costo REAL por unidad puesta en tu depósito: FOB × tipo de cambio + flete, seguro, aranceles y despachante prorrateados.',
              },
              {
                term: 'Lead time',
                def: 'Cuántos días tarda un pedido al proveedor en llegar. Con 90 días de lead time, lo que pidas hoy llega en tres meses: la reposición avisa ANTES.',
              },
              {
                term: 'Orden de compra (OC)',
                def: 'El pedido al proveedor con ítems, cantidades y costos. Sigue el ciclo: borrador → confirmada → producción → tránsito → aduana → recibida.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Facturación y legal',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'CAE',
                def: 'El código que ARCA le asigna a cada factura electrónica y la hace fiscalmente válida.',
              },
              {
                term: 'Homologación',
                def: 'El ambiente de práctica de ARCA o Mercado Pago: idéntico al real, pero las operaciones no valen. Todo se prueba ahí primero.',
              },
              {
                term: 'Nota de crédito',
                def: 'El comprobante que anula (total o parcialmente) una factura, por ejemplo ante un reembolso. El sistema la emite solo.',
              },
              {
                term: 'Botón de Arrepentimiento',
                def: 'El formulario legal obligatorio (Res. 424/2020) para que el comprador se arrepienta de una compra online. Las solicitudes caen en Mensajes de contacto.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Técnicas (por si aparecen)',
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Webhook',
                def: 'Un aviso automático entre sistemas: Mercado Pago le avisa a la plataforma que un pago se aprobó, sin que nadie consulte.',
              },
              {
                term: 'OAuth',
                def: 'La pantalla oficial de "autorizar" de MP/ML/Meta: conectás tu cuenta sin compartir tu contraseña con nadie.',
              },
              {
                term: 'CSV',
                def: 'Archivo de planilla (tipo Excel) para importar o exportar el catálogo completo de una vez.',
              },
              {
                term: 'SEO',
                def: 'Que tu tienda aparezca bien en Google. El sistema lo trabaja solo: títulos, descripciones y datos de producto.',
              },
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
