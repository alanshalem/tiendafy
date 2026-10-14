/* ============================================================
   El "sobre" común de toda sección del inicio: lo que no depende del
   tipo (id, visibilidad, nombre propio, en qué dispositivos se ve y el
   estilo del bloque). La data propia de cada tipo va en `data`.
   ============================================================ */

/**
 * Los tipos de sección que existen. El orden es el del menú "Agregar sección"
 * dentro de cada grupo. Agregar uno: ver README.md de esta carpeta.
 */
export const SECTION_TYPES = [
  'hero-video',
  'carousel',
  'promo-banners',
  'category-banners',
  'featured',
  'new-products',
  'sale-products',
  'institutional',
  'image-text',
  'faq',
  'info-bar',
  'testimonials',
  'brands',
  'newsletter',
  'instagram',
  'countdown-offer',
  'featured-product',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const isSectionType = (v: unknown): v is SectionType =>
  typeof v === 'string' && (SECTION_TYPES as readonly string[]).includes(v);

export type SectionBackground = 'none' | 'subtle' | 'accent' | 'custom';
export type SectionSpacing = 'none' | 'sm' | 'md' | 'lg';
export type SectionAlign = 'left' | 'center';
/** En qué dispositivo NO se muestra. Sin valor = en todos. */
export type SectionHideOn = 'mobile' | 'desktop';

/** Estilo del bloque. Todo opcional: sin valor, la sección se ve como fue diseñada. */
export interface SectionStyle {
  background?: SectionBackground;
  /** Color de fondo "R G B" (solo con background 'custom'). */
  backgroundColor?: string;
  paddingTop?: SectionSpacing;
  paddingBottom?: SectionSpacing;
  align?: SectionAlign;
}

export interface ThemeSection {
  id: string;
  type: SectionType;
  visible: boolean;
  /** Nombre propio que le puso el comercio (solo se ve en el editor). Vacío = el del tipo. */
  name?: string;
  /** Ocultarla en celular o en computadora. Se resuelve con CSS: sin saltos al hidratar. */
  hideOn?: SectionHideOn;
  style?: SectionStyle;
  data: Record<string, unknown>;
}

export const SECTION_BACKGROUNDS: readonly SectionBackground[] = ['none', 'subtle', 'accent', 'custom'];
export const SECTION_SPACINGS: readonly SectionSpacing[] = ['none', 'sm', 'md', 'lg'];
export const SECTION_ALIGNS: readonly SectionAlign[] = ['left', 'center'];
export const SECTION_HIDE_ON: readonly SectionHideOn[] = ['mobile', 'desktop'];

/** Un color en el formato del tema: "R G B" con cada canal de 0 a 255. */
export function isRgbTriplet(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(v.trim());
  return !!m && m.slice(1).every((n) => Number(n) <= 255);
}

const pick = <T extends string>(allowed: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/** Estilo saneado: solo las claves conocidas con valores válidos. `undefined` si no queda nada. */
export function normalizeSectionStyle(raw: unknown): SectionStyle | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const style: SectionStyle = {};
  const background = pick(SECTION_BACKGROUNDS, r.background);
  if (background) style.background = background;
  if (isRgbTriplet(r.backgroundColor)) style.backgroundColor = r.backgroundColor.trim();
  const paddingTop = pick(SECTION_SPACINGS, r.paddingTop);
  if (paddingTop) style.paddingTop = paddingTop;
  const paddingBottom = pick(SECTION_SPACINGS, r.paddingBottom);
  if (paddingBottom) style.paddingBottom = paddingBottom;
  const align = pick(SECTION_ALIGNS, r.align);
  if (align) style.align = align;
  return Object.keys(style).length > 0 ? style : undefined;
}

export const normalizeHideOn = (v: unknown): SectionHideOn | undefined => pick(SECTION_HIDE_ON, v);
