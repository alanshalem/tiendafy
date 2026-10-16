/*
 * Del tema a lo que se dibuja: variables CSS, colores legibles, columnas de
 * la grilla. Aparte de theme.ts (que trae el tema de la API y lo normaliza)
 * porque esto lo usan también los componentes del navegador, y theme.ts
 * arrastra el registro de secciones y el cliente HTTP del servidor.
 */
import { contrastText, FONT_FAMILY_CSS, mixRgb, readableOn } from '@tiendafy/types';
import type { ButtonStyle, ProductListConfig, ThemeConfig } from '@tiendafy/types';

// Catálogo compartido, con las fuentes que la tienda ya carga como variables.
// Las del catálogo las sirve la propia tienda (app/store-fonts.ts): cada una
// vive en su variable CSS; si faltara, cae a la familia por nombre.
const SELF_HOSTED: Record<string, string> = {
  poppins: "var(--font-poppins, 'Poppins'), sans-serif",
  inter: "var(--font-inter, 'Inter'), sans-serif",
  montserrat: "var(--font-montserrat, 'Montserrat'), sans-serif",
  barlow: "var(--font-barlow, 'Barlow'), sans-serif",
  barlowcondensed:
    "var(--font-barlow-condensed, 'Barlow Condensed'), var(--font-barlow, 'Barlow'), sans-serif",
  dmsans: "var(--font-dm-sans, 'DM Sans'), sans-serif",
  manrope: "var(--font-manrope, 'Manrope'), sans-serif",
  worksans: "var(--font-work-sans, 'Work Sans'), sans-serif",
  spacegrotesk: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif",
  playfair: "var(--font-playfair, 'Playfair Display'), serif",
  lora: "var(--font-lora, 'Lora'), serif",
  cormorant: "var(--font-cormorant, 'Cormorant Garamond'), serif",
  dmserif: "var(--font-dm-serif, 'DM Serif Display'), serif",
  bebas: "var(--font-bebas, 'Bebas Neue'), sans-serif",
  archivoblack: "var(--font-archivo-black, 'Archivo Black'), sans-serif",
};

const FONT_FAMILIES: Record<string, string> = {
  ...FONT_FAMILY_CSS,
  ...SELF_HOSTED,
  sans: 'var(--font-sans)',
  display: 'var(--font-fraunces, Georgia, serif)',
  mono: 'var(--font-mono)',
};

/** Texto legible (blanco u oscuro) según la luminancia del fondo "R G B" (fuente única en @tiendafy/types). */
const contrastFg = contrastText;

/** Mapa de columnas de grilla del listado (compartido por sections + CatalogBrowser). */
/** Proporción de la foto en la grilla del listado. */
export const ratioClass: Record<string, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[4/3]',
};

export const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

/** Lo mismo con una sola columna en el celular (una foto grande por fila). */
const colClassOneMobile: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-4',
};

/**
 * Las columnas de la grilla de productos según el diseño: las de escritorio y
 * cuántas en el celular. Las clases van escritas enteras (Tailwind solo genera
 * las que encuentra literales en el código).
 */
export function productGridClass(list: Pick<ProductListConfig, 'columns' | 'mobileColumns'>): string {
  const map = list.mobileColumns === 1 ? colClassOneMobile : colClass;
  return map[list.columns] ?? map[4]!;
}

/** El color de la marca para texto: se lee a 4,5:1 sobre el fondo y sobre un tinte de hasta 15%. */
export function primaryInk(theme: ThemeConfig): string {
  const { primary, bg } = theme.colors;
  return readableOn(primary, [bg, mixRgb(bg, primary, 0.15)]);
}

/**
 * Texto secundario (descripciones, pies, títulos de filtro): el color del texto
 * aclarado hacia el fondo, pero nunca por debajo de 4,5:1 —ni sobre el fondo
 * ni sobre las superficies apenas sombreadas (`bg-black/5`)—. Antes era
 * `opacity-60` sobre el texto, y con los grises de algunas marcas no se leía.
 */
export function mutedText(theme: ThemeConfig): string {
  const { text, bg } = theme.colors;
  return readableOn(mixRgb(text, bg, 0.4), [bg, mixRgb(bg, '0 0 0', 0.05)]);
}

/** Un color de estado como texto: a 4,5:1 sobre el fondo y sobre un sombreado leve del texto. */
function statusInk(theme: ThemeConfig, rgb: string): string {
  const { text, bg } = theme.colors;
  return readableOn(rgb, [bg, mixRgb(bg, text, 0.06)]);
}

/** Radio de cada forma de botón. 'auto' no define nada: sigue a los bordes globales. */
const BUTTON_RADIUS: Record<ButtonStyle['shape'], string | null> = {
  auto: null,
  square: '0px',
  rounded: '0.5rem',
  pill: '9999px',
};

/**
 * Estilo global de botones → variables CSS que lee globals.css (regla de los
 * botones primarios: `bg-primary text-primary-fg`). Así cada botón de la
 * tienda lo hereda sin tocar su componente. Lo que está en su valor de
 * siempre no se define: globals.css cae a lo que ya tenía el botón.
 */
export function buttonVars(buttons: ButtonStyle): Record<string, string> {
  const vars: Record<string, string> = {};
  const radius = BUTTON_RADIUS[buttons.shape];
  if (radius) vars['--btn-radius'] = radius;
  if (buttons.variant === 'outline') {
    vars['--btn-bg'] = 'transparent';
    vars['--btn-bg-hover'] = 'rgb(var(--color-primary) / 0.08)';
    vars['--btn-fg'] = 'rgb(var(--color-primary-ink))';
    vars['--btn-border-width'] = '1.5px';
  }
  if (buttons.textCase === 'uppercase') {
    vars['--btn-case'] = 'uppercase';
    vars['--btn-tracking'] = '0.06em';
  }
  return vars;
}

/** ¿La tienda es oscura? (el texto que se le calcula encima del fondo es blanco). */
export function isDarkTheme(theme: ThemeConfig): boolean {
  return contrastText(theme.colors.bg) === '255 255 255';
}

/** Config de tema → CSS custom properties para el wrapper del storefront. */
export function themeToStyle(theme: ThemeConfig): Record<string, string> {
  const c = theme.colors;
  return {
    ...(theme.buttons ? buttonVars(theme.buttons) : {}),
    '--color-primary': c.primary,
    '--color-primary-hover': c.primary,
    // Texto sobre el color primario: oscuro si el primario es claro (lima, cian…), blanco si no.
    '--color-primary-fg': contrastFg(c.primary),
    // El primary como texto: legible sobre el fondo y sobre su propio tinte (chips, badges).
    '--color-primary-ink': primaryInk(theme),
    '--color-accent': c.useAccent ? c.accent : c.primary,
    '--color-bg': c.bg,
    '--color-surface': c.bg,
    '--color-fg': c.text,
    '--color-fg-muted': mutedText(theme),
    // Rojo y verde de estado ("Sin stock", "Quitar", descuentos) ajustados al
    // fondo de la tienda: el red-600 fijo daba 3:1 sobre un fondo oscuro.
    '--color-danger': statusInk(theme, '220 38 38'),
    '--color-success': statusInk(theme, '22 163 74'),
    // El ámbar de "pocas unidades" o "pendiente", con el mismo ajuste.
    '--color-warning': statusInk(theme, '217 119 6'),
    // Los controles nativos (la lista de un <select>, el tilde de un checkbox,
    // la barra de scroll) siguen al fondo: con `light` fijo, la lista de un
    // select en una tienda oscura salía blanca con el texto claro encima.
    colorScheme: isDarkTheme(theme) ? 'dark' : 'light',
    '--store-header-bg': theme.header.bg,
    '--font-heading': FONT_FAMILIES[theme.fonts.heading] ?? FONT_FAMILIES.sans!,
    '--font-body': FONT_FAMILIES[theme.fonts.body] ?? FONT_FAMILIES.sans!,
  };
}
