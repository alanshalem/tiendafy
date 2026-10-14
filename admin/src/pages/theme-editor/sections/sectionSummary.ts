import {
  sectionData,
  sectionDefinition,
  sectionProductPlan,
  type ItemBase,
  type ThemeSection,
} from '@tiendafy/types';
import { itemDisplayTitle } from './ItemListEditor';

/*
 * La segunda línea de cada fila de la lista de secciones: qué tiene adentro.
 * Dos "Preguntas frecuentes" seguidas se veían idénticas y había que abrir
 * cada una para saber cuál era cuál. No conoce los tipos uno por uno: mira la
 * forma de la data (una lista de ítems, de imágenes, un título), así un tipo
 * nuevo del registro ya trae su resumen.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PRODUCT_SOURCE: Record<string, string> = {
  category: 'De una categoría',
  newest: 'Lo último que cargaste',
  'on-sale': 'Los que están en oferta',
  'best-sellers': 'Lo más vendido',
};

function productsSummary(section: ThemeSection): string | null {
  const plan = sectionProductPlan(section);
  if (!plan) return null;
  const { source } = plan;
  if (source.kind === 'manual')
    return source.ids.length > 0
      ? `${plural(source.ids.length, 'producto elegido', 'productos elegidos')} a mano`
      : 'Elegidos a mano: ninguno todavía';
  if (source.kind === 'brand') return `De la marca ${source.brand}`;
  return PRODUCT_SOURCE[source.kind] ?? null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Lo que dice la data, en una línea. */
function contentSummary(section: ThemeSection): string {
  const products = productsSummary(section);
  if (products) return products;
  const def = sectionDefinition(section.type);
  // Normalizada si el tipo se conoce; si no (versión más nueva), la cruda.
  const data: Record<string, unknown> = def
    ? (sectionData(section) as Record<string, unknown>)
    : section.data;
  // Qué es cada campo lo dice el registro; un tipo desconocido se adivina por la forma.
  const kindOf = (key: string, v: unknown) =>
    def?.fields[key]?.kind ??
    (Array.isArray(v) ? (v.some(isRecord) ? 'items' : 'strings') : typeof v === 'string' ? 'string' : '');
  const entries = Object.entries(data);

  const items = entries.find(([k, v]) => kindOf(k, v) === 'items' && Array.isArray(v));
  if (items) {
    const list = (items[1] as unknown[]).filter(isRecord);
    if (list.length === 0) return 'Sin ítems todavía';
    const names = list
      .slice(0, 2)
      .map((it, i) => itemDisplayTitle(it as ItemBase, i))
      .join(', ');
    return `${plural(list.length, 'ítem', 'ítems')}: ${names}${list.length > 2 ? '…' : ''}`;
  }
  const images = entries.find(([k, v]) => kindOf(k, v) === 'strings' && Array.isArray(v));
  if (images) {
    const n = (images[1] as unknown[]).length;
    return n > 0 ? plural(n, 'imagen', 'imágenes') : 'Sin imágenes todavía';
  }
  for (const key of ['title', 'text', 'description', 'video']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Repetir el nombre del tipo no dice nada: se avisa que falta cargarla.
  return def ? 'Sin completar todavía' : '';
}

/** "Oculta · Solo en computadoras · 3 ítems: …". */
export function sectionSummary(section: ThemeSection): string {
  const parts: string[] = [];
  if (!section.visible) parts.push('Oculta');
  if (section.hideOn === 'mobile') parts.push('Oculta en celular');
  if (section.hideOn === 'desktop') parts.push('Solo en celular');
  const content = contentSummary(section);
  if (content) parts.push(content);
  return parts.join(' · ');
}
