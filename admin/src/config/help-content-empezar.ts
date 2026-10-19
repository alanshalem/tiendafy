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
          'Cargá tus productos: en Productos, tocá “Agregar producto” y cargá fotos, precio, variantes, stock y el peso y las medidas para que los correos coticen bien. Si tenés muchos, usá “Exportar e importar” y subilos con una planilla.',
          'Conectá Mercado Pago: en Configuración → Medios de pago, tocá “Conectá tu cuenta de Mercado Pago” y autorizala. La plata va directo a vos. En la misma pantalla podés sumar transferencia y efectivo al retirar, con descuento.',
          'Definí los envíos: en Configuración → Medios de envío tocá “Agregar medio de envío” y creá al menos uno (“Envío a domicilio” con su precio, que puede ser gratis desde un monto, o “Retiro en punto” para que lo busquen por tu local). Sin esto el checkout no ofrece entrega.',
          'Revisá los e-mails automáticos: en Configuración → E-mails automáticos activá los que quieras; salen con tu logo y colores.',
          'Sumá a tu equipo: en Configuración → Usuarios agregá a cada persona con su rol (vendedor, catálogo, finanzas, soporte…).',
          'Compartí tu dirección: tu tienda ya tiene una, la ves arriba con “Ver mi tienda” y, si sos el dueño, en Configuración → Dominios, donde también está “Conectar mi dominio” para usar uno propio.',
        ],
      },
      {
        heading: 'Probá una compra de punta a punta',
        paragraphs: [
          'Antes de difundir tu tienda, hacete una compra de prueba: agregá un producto al carrito, completá el checkout (entrega → pago) y pagá de verdad por un monto chico: con tu cuenta de Mercado Pago conectada, las tarjetas de prueba no funcionan. Después devolvé la plata desde la venta.',
          'Verificá que la venta aparezca en Ventas con su número de pedido (#1001, #1002…), que llegue el email de confirmación y que puedas marcarla como enviada.',
        ],
        blocks: [
          {
            type: 'checklist',
            items: [
              'La venta aparece en Ventas como “Pagada”.',
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
          'Algunas integraciones (Mercado Pago, Mercado Libre, los emails, las redes sociales) tienen dos niveles: algo que se configura una sola vez en el servidor para todas las tiendas, y la conexión de cada tienda desde el panel. Si un botón de conectar avisa que “falta configuración”, casi seguro falta el nivel del servidor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Todo lo de plataforma está junto en el centro de ayuda, en la categoría “Administrar la plataforma”: qué necesita cada integración en cada nivel (artículo «Cómo está armado y en qué orden se levanta»), el inventario completo de credenciales y los trámites con cada proveedor.',
          },
        ],
      },
      {
        heading: 'Moverte rápido por el panel',
        blocks: [
          {
            type: 'checklist',
            items: [
              'El buscador del panel se abre con el botón “Buscar…” de arriba o con Ctrl+K (⌘K en Mac): escribí el número de una venta, el nombre, email o teléfono de un cliente, un producto o su SKU, una compra, un proveedor o el nombre de una pantalla, y vas directo. Los resultados vienen agrupados y te movés con las flechas y Enter.',
              'En Inicio, la tarjeta “Para hacer hoy” junta lo que necesita tu atención, cada cosa con su link al listado ya filtrado: arrepentimientos sin atender (con los días que quedan del plazo), ventas pagadas para revisar (se cobraron sin stock o figuraban canceladas), ventas para despachar, transferencias por confirmar, preguntas de Mercado Libre sin responder, mensajes de contacto sin leer, ventas de Mercado Libre sin facturar, productos que se agotan antes del próximo embarque, cuentas de redes para reconectar, posts que fallaron y ventas del mes sin costo cargado. Cada persona ve solo lo que le toca según su rol, y sin nada pendiente la tarjeta no aparece.',
              'Mientras falte algo básico, Inicio muestra también “Poné tu tienda en marcha”: cargar el primer producto, conectar Mercado Pago y subir tu logo, cada uno con su link. Cuando está todo hecho, desaparece sola.',
              'Arriba a la derecha, junto al buscador: “Ver mi tienda” (la abre en otra pestaña), el modo claro u oscuro y el menú de tu cuenta (tu inicial), con “Mis tiendas” y “Cerrar sesión”. Para pasar a otra tienda usá el selector de tienda del encabezado.',
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
                term: 'Número de pedido',
                def: 'El número correlativo de cada venta de tu tienda (#1042). Es el que ve el comprador en sus mails y en “Seguí tu pedido”, y el que sirve para buscar la venta en el panel y en el buscador (Ctrl+K).',
              },
              {
                term: 'Transferencia por confirmar',
                def: 'Una venta que el comprador eligió pagar por transferencia (o en efectivo al retirar): queda “Pendiente” hasta que ves la plata y tocás “Registrar pago” en la venta. Si no la registrás en el plazo que elegiste en Medios de pago, se cancela sola y el stock vuelve a la venta.',
              },
              {
                term: 'Cuenta corriente',
                def: 'Lo que un cliente te debe (o lo que vos le debés a un proveedor), con cada venta o compra y cada cobro o pago imputado. Se lleva en Tesorería → Cuentas corrientes.',
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
                term: 'Precio promocional / tachado',
                def: 'Si a un producto le cargás un “Precio promocional”, la tienda muestra ese y, al lado, el precio de lista tachado. Un producto con precio promocional cuenta como “en oferta” en toda la tienda.',
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
                term: 'Reservado y disponible',
                def: 'Reservado es el stock apartado por una compra en curso; disponible, lo que se puede vender ahora (el stock menos lo reservado). Si el pago no llega en 30 minutos, lo reservado vuelve solo a disponible; si llega después igual, la venta queda pagada y el stock se descuenta en ese momento (y si ya no había, la venta queda para revisar). Con transferencia o efectivo al retirar, queda apartado el tiempo que elegiste en Medios de pago (“Cuánto te guardamos el stock”).',
              },
              {
                term: 'Historial de stock',
                def: 'Cada movimiento de una variante, del más nuevo al más viejo: altas, ajustes, lo apartado por una compra, lo que volvió por una compra cancelada o no pagada a tiempo, y las ventas cobradas. Se abre desde Productos → Inventario y responde “¿por qué me quedan 3 si ayer había 8?”.',
              },
              {
                term: 'Kit / combo',
                def: 'Un producto compuesto por otros ("Kit barra + discos"): al venderse, descuenta el stock de cada pieza.',
              },
              {
                term: 'Picking',
                def: 'Juntar los productos de un pedido en el depósito. En el Escáner, “Preparar pedido” te hace escanear cada producto y avisa si agarraste el equivocado; en Despacho, la “Lista de picking” junta lo de varios pedidos de una vez.',
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
                def: 'El pedido al proveedor con ítems, cantidades y costos. Sigue el ciclo: Borrador → Confirmada → En producción → En tránsito → En aduana → Recibida (o Cancelada).',
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
                def: 'El modo de práctica de ARCA (y de Correo Argentino): idéntico al real, pero las operaciones no valen. Todo se prueba ahí primero. Una factura de homologación no cuenta como facturada cuando pasás a producción.',
              },
              {
                term: 'Nota de crédito',
                def: 'El comprobante que anula una factura, entera o en parte. Una venta puede tener varias: una por cada reembolso, total o parcial. Si facturás automático, cada reembolso emite la suya; si no, la emitís desde la venta con “Emitir nota de crédito”. En Ventas, el filtro “Devueltas sin nota de crédito” muestra las facturadas con plata devuelta que todavía no la tienen.',
              },
              {
                term: 'Botón de Arrepentimiento',
                def: 'El formulario legal obligatorio (Res. 424/2020) para que el comprador se arrepienta de una compra online. Las solicitudes caen en Mensajes de contacto, y mientras haya alguna sin atender, Inicio la muestra en rojo con los días que quedan.',
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
                def: 'Un aviso automático entre sistemas: Mercado Pago o Mercado Libre le avisan a tu tienda que entró un pago o una venta, sin que nadie consulte.',
              },
              {
                term: 'OAuth',
                def: 'La pantalla oficial de “autorizar” de Mercado Pago, Mercado Libre o Meta: conectás tu cuenta sin compartir tu contraseña con nadie.',
              },
              {
                term: 'CSV',
                def: 'Archivo de planilla que abre Excel. Sirve para importar o exportar el catálogo completo, cargar costos en masa y descargar las ventas, los clientes o los comprobantes del mes.',
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
