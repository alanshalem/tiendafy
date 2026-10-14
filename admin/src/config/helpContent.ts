import type { HelpLinkId } from './features';

/** Demos visuales: componentes REALES del panel renderizados dentro del artículo. */
export type HelpDemoId =
  | 'orderStatuses' // badges de estado de una venta, idénticos a los de Ventas
  | 'campaignStatuses' // badges de estado de una campaña de email
  | 'switch' // el toggle on/off que se usa en todas las configuraciones
  | 'helpLink' // el link "Más sobre…" que aparece al pie de cada pantalla
  | 'coupon' // cómo ve el comprador un cupón aplicado en el checkout
  | 'storefrontPreview'; // mini tienda interactiva para el artículo de diseño

export type HelpBlock =
  | { type: 'callout'; tone: 'tip' | 'info' | 'warning' | 'danger'; title?: string; text: string }
  | { type: 'path'; label?: string; segments: string[] } // ruta dentro del panel: "Configuración → Medios de pago"
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'terms'; items: { term: string; def: string }[] } // diccionario término → definición
  | { type: 'checklist'; items: string[] }
  | { type: 'demo'; demo: HelpDemoId; caption?: string };

interface HelpSection {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  /** Bloques ricos (callouts, tablas, demos…) — se renderizan después del texto. */
  blocks?: HelpBlock[];
}

/** Orden y nombres canónicos de las categorías del índice de ayuda. */
export const HELP_CATEGORIES = [
  'Empezar',
  'Ventas y pagos',
  'Legal y facturación',
  'Envíos',
  'Catálogo',
  'Finanzas',
  'Clientes y comunicación',
  'Tu tienda online',
  'Equipo',
  // Última a propósito: es la única categoría que NO está escrita para quien
  // vende, sino para quien opera la plataforma.
  'Administrar la plataforma',
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpArticle {
  title: string;
  intro: string;
  /** Agrupa los artículos en el índice del centro de ayuda. */
  category: HelpCategory;
  /**
   * Palabras con las que alguien busca este tema y que el texto no dice tal
   * cual: sinónimos ("slider" por carrusel), nombres de otras plataformas o
   * formas de escribirlo ("popup" sin guion). No se muestran: solo alimentan
   * el buscador del índice.
   */
  keywords?: string[];
  sections: HelpSection[];
}

import { BRAND } from '../lib/runtime';
import { EMPEZAR } from './help-content-empezar';
import { VENTAS } from './help-content-ventas';
import { LEGAL } from './help-content-legal';
import { ENVIOS } from './help-content-envios';
import { CATALOGO } from './help-content-catalogo';
import { FINANZAS } from './help-content-finanzas';
import { CLIENTES } from './help-content-clientes';
import { DISENO } from './help-content-diseno';
import { SECCIONES } from './help-content-secciones';
import { TIENDA } from './help-content-tienda';
import { EQUIPO } from './help-content-equipo';
import { PLATAFORMA } from './help-content-plataforma';

/**
 * Reemplaza el nombre del producto por el de la instalación en TODOS los textos
 * de la ayuda, de una sola vez.
 *
 * Los manuales están escritos con el nombre del producto ("Tiendafy lo hace
 * solo por vos"), pero quien los lee ve el panel con la marca de su empresa: el
 * texto tiene que hablarle de lo que él ve. Se hace acá, sobre los datos, y no
 * en cada lugar que renderiza — así la búsqueda, la paleta de comandos y las
 * tarjetas del índice quedan en la misma marca sin tocar nada.
 *
 * Sensible a mayúsculas a propósito: la forma en minúscula aparece en rutas,
 * nombres de paquetes (`@tiendafy/ui`) y contenedores (`tiendafy-postgres`) de
 * los artículos técnicos, y esos NO se renombran.
 */
function withBrand<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll('Tiendafy', BRAND) as T;
  if (Array.isArray(value)) return value.map(withBrand) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withBrand(v)])) as T;
  }
  return value;
}

/** Manuales reales de cada parte del sistema. Se muestran en /ayuda/:topic. */
export const HELP_CONTENT: Record<HelpLinkId, HelpArticle> = withBrand({
  ...EMPEZAR,
  ...VENTAS,
  ...LEGAL,
  ...ENVIOS,
  ...CATALOGO,
  ...FINANZAS,
  ...CLIENTES,
  // El editor de diseño primero: es lo primero que se busca de "Tu tienda online".
  ...DISENO,
  ...SECCIONES,
  ...TIENDA,
  ...EQUIPO,
  ...PLATAFORMA,
});
