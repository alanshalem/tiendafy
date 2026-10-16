/* ============================================================
   Formas viejas de la data de una sección → la de hoy.

   La migración del tema (migrations.ts) las aplica UNA vez al leer un
   tema guardado. El normalizador (registry.ts) las vuelve a aplicar a
   cualquier data que llega por otro camino —un postMessage de una
   pestaña vieja del editor, un JSON pegado a mano, un test—, así una
   sección vieja se ve igual que antes venga de donde venga.

   Cada función es pura, nunca tira y es idempotente: aplicada a data
   que ya está en la forma nueva, la devuelve igual.
   ============================================================ */

import { isPlainObject, isSafeMedia } from './schema';

type Data = Record<string, unknown>;

/** Las fotos de una lista vieja que se podían mostrar (las vacías o peligrosas ya se descartaban). */
const usableImages = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '' && isSafeMedia(s))
    : [];

/**
 * Carrusel v1 → v2: `images: string[]` pasa a `slides: { image }[]` (cada
 * diapositiva ahora lleva link, textos, imagen de celular…) y el
 * `fullHeightMobile` de antes pasa a ser una de las alturas de celular.
 */
export function upgradeCarouselData(data: Data): Data {
  if (!isPlainObject(data)) return data;
  const out: Data = { ...data };
  if (!Array.isArray(out.slides) && Array.isArray(out.images))
    out.slides = usableImages(out.images).map((image) => ({ image }));
  // Si ya hay diapositivas, la lista vieja sobra (una pestaña vieja pudo
  // dejar las dos): manda la nueva.
  if (Array.isArray(out.slides)) delete out.images;
  if ('fullHeightMobile' in out) {
    if (out.heightMobile === undefined) out.heightMobile = out.fullHeightMobile === true ? 'full' : 'auto';
    delete out.fullHeightMobile;
  }
  return out;
}

/** Marcas v1 → v2: `images: string[]` pasa a `logos: { image }[]` (con nombre y link opcionales). */
export function upgradeBrandsData(data: Data): Data {
  if (!isPlainObject(data)) return data;
  const out: Data = { ...data };
  if (!Array.isArray(out.logos) && Array.isArray(out.images))
    out.logos = usableImages(out.images).map((image) => ({ image }));
  if (Array.isArray(out.logos)) delete out.images;
  return out;
}

/** Por tipo de sección, cómo se lleva su data vieja a la forma de hoy. */
const LEGACY_DATA_UPGRADES: Readonly<Partial<Record<string, (data: Data) => Data>>> = {
  carousel: upgradeCarouselData,
  brands: upgradeBrandsData,
};

/** La data de una sección llevada a la forma de hoy (o tal cual, si el tipo no cambió nunca). */
export function upgradeSectionData(type: string, data: unknown): unknown {
  const upgrade = LEGACY_DATA_UPGRADES[type];
  return upgrade && isPlainObject(data) ? upgrade(data) : data;
}
