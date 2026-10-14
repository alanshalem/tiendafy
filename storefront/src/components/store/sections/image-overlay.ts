import type { BannerRatio, Overlay, TextPosition } from '@tiendafy/types';

/*
 * Texto sobre una foto (carrusel, banners, hero): dónde va y cómo se
 * oscurece la foto para que se lea. Lo comparten las secciones de imágenes
 * para que "medio" o "abajo a la izquierda" signifiquen lo mismo en todas.
 * Las clases van enteras (no armadas por partes): Tailwind solo genera las
 * que ve escritas.
 */

/** Velo parejo sobre toda la foto. */
export const OVERLAY_BG: Record<Overlay, string> = {
  none: '',
  light: 'bg-black/20',
  medium: 'bg-black/40',
  strong: 'bg-black/60',
};

/** Posición del bloque de texto dentro de un contenedor `flex flex-col`. */
export const POSITION_CLASS: Record<TextPosition, string> = {
  'top-left': 'justify-start items-start text-left',
  'top-center': 'justify-start items-center text-center',
  'top-right': 'justify-start items-end text-right',
  'center-left': 'justify-center items-start text-left',
  center: 'justify-center items-center text-center',
  'center-right': 'justify-center items-end text-right',
  'bottom-left': 'justify-end items-start text-left',
  'bottom-center': 'justify-end items-center text-center',
  'bottom-right': 'justify-end items-end text-right',
};

export const verticalOf = (p: TextPosition): 'top' | 'center' | 'bottom' =>
  p === 'center' ? 'center' : (p.split('-')[0] as 'top' | 'center' | 'bottom');

/**
 * Degradé del tamaño del texto (no de toda la foto): oscurece solo detrás de
 * las letras, desde el borde donde están. Antes el degradé de los banners
 * cubría la foto entera y aun así el texto largo quedaba sobre la parte clara.
 */
const SCRIM: Record<'top' | 'bottom', Record<Overlay, string>> = {
  bottom: {
    none: '',
    light: 'bg-linear-to-t from-black/50 via-black/30 to-transparent',
    medium: 'bg-linear-to-t from-black/75 via-black/50 to-transparent',
    strong: 'bg-linear-to-t from-black/90 via-black/70 to-black/10',
  },
  top: {
    none: '',
    light: 'bg-linear-to-b from-black/50 via-black/30 to-transparent',
    medium: 'bg-linear-to-b from-black/75 via-black/50 to-transparent',
    strong: 'bg-linear-to-b from-black/90 via-black/70 to-black/10',
  },
};

/**
 * Lo que va detrás del texto según dónde está: arriba o abajo, un degradé
 * del alto del texto; en el medio, un velo parejo sobre toda la foto.
 */
export function scrimFor(position: TextPosition, overlay: Overlay): { cover: string; caption: string } {
  const v = verticalOf(position);
  if (v === 'center') return { cover: OVERLAY_BG[overlay], caption: '' };
  return { cover: '', caption: SCRIM[v][overlay] };
}

/** Sombra suave en las letras: sin velo, el blanco sobre una foto clara igual se distingue. */
export const TEXT_SHADOW = '[text-shadow:0_1px_3px_rgb(0_0_0/0.6)]';

/** La misma proporción, desde 768 px (cuando en celular va otra). */
export const RATIO_CLASS_MD: Record<BannerRatio, string> = {
  '3x1': 'md:aspect-[3/1]',
  '2x1': 'md:aspect-[2/1]',
  '16x9': 'md:aspect-video',
  '4x3': 'md:aspect-[4/3]',
  '1x1': 'md:aspect-square',
  '4x5': 'md:aspect-[4/5]',
  '3x4': 'md:aspect-[3/4]',
};

/** Proporción "ancho x alto" → clase de aspect-ratio. */
export const RATIO_CLASS: Record<BannerRatio | 'original', string> = {
  '3x1': 'aspect-[3/1]',
  '2x1': 'aspect-[2/1]',
  '16x9': 'aspect-video',
  '4x3': 'aspect-[4/3]',
  '1x1': 'aspect-square',
  '4x5': 'aspect-[4/5]',
  '3x4': 'aspect-[3/4]',
  original: '',
};
