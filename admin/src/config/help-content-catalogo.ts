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
} satisfies Record<string, HelpArticle>;
