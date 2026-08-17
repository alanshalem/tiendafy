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
  'Clientes y comunicación',
  'Tu tienda online',
  'Equipo',
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpArticle {
  title: string;
  intro: string;
  /** Agrupa los artículos en el índice del centro de ayuda. */
  category: HelpCategory;
  sections: HelpSection[];
}

import { EMPEZAR } from './help-content-empezar';
import { VENTAS } from './help-content-ventas';
import { LEGAL } from './help-content-legal';
import { ENVIOS } from './help-content-envios';
import { CATALOGO } from './help-content-catalogo';
import { CLIENTES } from './help-content-clientes';
import { TIENDA } from './help-content-tienda';
import { EQUIPO } from './help-content-equipo';

/** Manuales reales de cada parte del sistema. Se muestran en /ayuda/:topic. */
export const HELP_CONTENT: Record<HelpLinkId, HelpArticle> = {
  ...EMPEZAR,
  ...VENTAS,
  ...LEGAL,
  ...ENVIOS,
  ...CATALOGO,
  ...CLIENTES,
  ...TIENDA,
  ...EQUIPO,
};
