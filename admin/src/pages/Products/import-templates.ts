import { downloadBlob } from '../../lib/download';

export const CSV_HEADER = [
  'Identificador de URL',
  'Nombre',
  'Categorías',
  'Nombre de propiedad 1',
  'Valor de propiedad 1',
  'Nombre de propiedad 2',
  'Valor de propiedad 2',
  'Precio',
  'Precio promocional',
  'Costo',
  'Peso (kg)',
  'Alto (cm)',
  'Ancho (cm)',
  'Profundidad (cm)',
  'Stock',
  'SKU',
  'Código de barras',
  'Mostrar en tienda',
  'Envío sin cargo',
  'Descripción',
  'Imágenes',
  'Tags',
  'Título para SEO',
  'Descripción para SEO',
  'Marca',
];

// Filas de ejemplo: producto con variantes (con 2 imágenes) y producto simple
// en dos categorías (se separan con «;», igual que en lo exportado).
// La columna "Imágenes" admite varias URLs separadas por espacio; al importar
// se descargan y re-hospedan en el storage de la tienda.
export const TEMPLATE_EXAMPLES = [
  [
    'remera-oversize',
    'Remera Oversize',
    'Indumentaria > Remeras',
    'Talle',
    'S',
    '',
    '',
    '12990',
    '',
    '7000',
    '0.2',
    '',
    '',
    '',
    '10',
    'REM-S',
    '',
    'SI',
    'NO',
    'Remera de algodón premium',
    'https://picsum.photos/seed/remera/800 https://picsum.photos/seed/remera-2/800',
    'remera,oversize',
    '',
    '',
    '',
  ],
  [
    'remera-oversize',
    'Remera Oversize',
    'Indumentaria > Remeras',
    'Talle',
    'M',
    '',
    '',
    '12990',
    '9990',
    '7000',
    '0.2',
    '',
    '',
    '',
    '8',
    'REM-M',
    '',
    'SI',
    'NO',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'mate-imperial',
    'Mate Imperial',
    'Bazar; Regalos',
    '',
    '',
    '',
    '',
    '8500',
    '',
    '4200',
    '0.4',
    '',
    '',
    '',
    '25',
    'MATE-01',
    '',
    'SI',
    'NO',
    'Mate de calabaza forrado en cuero',
    'https://picsum.photos/seed/mate/800',
    'mate,regalo',
    '',
    '',
    '',
  ],
];

// BOM UTF-8: Excel lo necesita para abrir el CSV con acentos bien; se quita al
// parsear un archivo importado. Construido por código para no tener el carácter
// invisible suelto en el fuente (eslint no-irregular-whitespace).
export const BOM = String.fromCharCode(0xfeff);

export function buildCsv(rows: string[][]): string {
  const escape = (c: string) => `"${c.replace(/"/g, '""')}"`;
  return BOM + rows.map((r) => r.map(escape).join(';')).join('\n');
}

export function downloadCsv(filename: string, content: string) {
  downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), filename);
}
