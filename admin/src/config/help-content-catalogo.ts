import type { HelpArticle } from './helpContent';

export const CATALOGO = {
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

  compras: {
    title: 'Compras e importaciones',
    intro:
      'Órdenes de compra a tus proveedores con el ciclo completo del importador: desde la proforma hasta el contenedor en el depósito, con el costo real de cada unidad calculado solo.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'El ciclo de una compra',
        paragraphs: [
          'Una orden de compra arranca como borrador: proveedor, moneda (típicamente USD), tipo de cambio estimado, lead time y los productos con su costo unitario FOB. Mientras es borrador podés editar todo.',
          'Al confirmarla, la vas moviendo por los estados reales de una importación: en producción → en tránsito → en aduana. Es visibilidad para vos y tu equipo — el sistema no exige papeles.',
        ],
      },
      {
        heading: 'Landed cost: lo que de verdad cuesta cada unidad',
        paragraphs: [
          'Cargá los gastos del embarque (flete, seguro, aranceles, despachante, IVA de aduana) en la moneda de la orden o directo en pesos. El sistema los prorratea entre los productos según su valor: la diferencia entre creer que un disco cuesta USD 4 y saber que puesto en tu depósito cuesta USD 6,80.',
        ],
      },
      {
        heading: 'Recibir la mercadería',
        steps: [
          'Tocá «Recibir» cuando llega el contenedor y confirmá cuántas unidades entraron de cada ítem (podés recibir menos de lo pedido).',
          'Poné el tipo de cambio definitivo del despacho.',
          'Al confirmar: el stock sube solo y el costo de cada variante queda fijado al landed cost — Estadísticas → Rentabilidad pasa a calcular la ganancia con el costo real importado.',
        ],
      },
      {
        heading: 'Reposición con lead time',
        paragraphs: [
          'Para un importador, la alerta de «stock bajo» llega tarde: si el reabastecimiento tarda 90 días, hay que pedir meses antes. La pestaña «Reposición sugerida» cruza lo vendido por día (últimos 60 días) con tu stock y tu lead time, y te dice qué se agota antes de que llegue el próximo embarque y cuánto pedir.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
