/**
 * Fichas del catálogo con IA en lote: los tipos de lo que manda `/api/v1/ai/catalog/*` y los textos con los que el panel
 * nombra cada estado. La plata llega en micro-dólares (como el resto de la IA): `formatUsd` de `lib/ai` la muestra.
 */

export type AiCatalogJobStatus =
  'Queued' | 'Running' | 'PausedBudget' | 'Done' | 'Cancelled' | 'PausedUnavailable';
export type AiCatalogItemStatus =
  'Pending' | 'NeedsCategory' | 'Review' | 'Approved' | 'Discarded' | 'Failed';

/** Lo más que entra en un trabajo. */
export const AI_CATALOG_MAX_ITEMS = 500;

export interface AiCatalogFilter {
  categoryId?: string;
  missingDescription: boolean;
  shortDescription: boolean;
  missingMeliData: boolean;
}

/** Exactamente uno de los dos: productos elegidos a mano o un filtro. */
export interface AiCatalogSelectionRequest {
  productIds?: string[];
  filter?: AiCatalogFilter;
}

export interface AiCatalogPreview {
  count: number;
  matched: number;
  capped: boolean;
  estimatedCostMicroUsd: number;
  budgetMicroUsd: number;
  committedMicroUsd: number;
  remainingMicroUsd: number;
  fitsBudget: boolean;
  writeModel: string | null;
  judgeModel: string | null;
  available: boolean;
  reason: string | null;
}

export interface AiCatalogJob {
  id: string;
  status: AiCatalogJobStatus;
  total: number;
  processed: number;
  byStatus: Record<AiCatalogItemStatus, number>;
  estimatedCostMicroUsd: number;
  actualCostMicroUsd: number;
  pauseReason: string | null;
  createdAt: string;
  createdByName: string;
}

export interface AiCatalogCategory {
  id: string;
  name: string;
}

export interface AiCatalogCurrent {
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  brand: string | null;
  specs: { name: string; value: string }[];
}

export interface AiCatalogProposedAttribute {
  id: string;
  name: string;
  value: string;
  valueId: string | null;
  valueName: string | null;
  unit: string | null;
  /** Dónde se guarda al aprobar: la ficha que ve el comprador o solo Mercado Libre. */
  target: 'spec' | 'meli';
  /** Cómo se pide el dato en la categoría (tipo, opciones, unidades): con eso se lo puede corregir en la revisión. */
  definition: AiCatalogMissing | null;
}

export interface AiCatalogProposal {
  description: string;
  seoTitle: string;
  seoDescription: string;
  attributes: AiCatalogProposedAttribute[];
}

export type AiCatalogAttributeKind = 'Text' | 'Number' | 'NumberUnit' | 'List' | 'Boolean' | 'Other';

/** Un dato que pide Mercado Libre y la IA no pudo sacar de lo que hay: se completa a mano. */
export interface AiCatalogMissing {
  attributeId: string;
  name: string;
  kind: AiCatalogAttributeKind;
  values: { id: string; name: string }[];
  units: string[];
  defaultUnit: string | null;
  required: boolean;
}

export interface AiCatalogItem {
  id: string;
  productId: string;
  status: AiCatalogItemStatus;
  passed: boolean;
  attempts: number;
  score: number | null;
  judgeNotes: string | null;
  current: AiCatalogCurrent;
  proposal: AiCatalogProposal | null;
  missing: AiCatalogMissing[];
  category: AiCatalogCategory | null;
  suggestions: AiCatalogCategory[];
  hasMeliListing: boolean;
  failureReason: string | null;
}

export interface AiCatalogItemsPage {
  items: AiCatalogItem[];
  total: number;
  /** Cuántas de las fichas para revisar pasaron el evaluador (lo que aprueba "aprobar todos los que pasaron"). */
  passed?: number;
}

/** Un dato de Mercado Libre que la persona completó o corrigió al aprobar. */
export interface AiCatalogAttributeInput {
  id: string;
  valueId?: string;
  valueName?: string;
  unit?: string;
}

export interface AiCatalogApproveBody {
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  attributes?: AiCatalogAttributeInput[];
  /** Ids de los datos propuestos que la persona quitó: no se guardan. */
  remove?: string[];
}

export interface AiCatalogPushResult {
  updated: number;
  failed: { productId: string; message: string }[];
  next: string | null;
}

export const JOB_STATUS_LABEL: Record<AiCatalogJobStatus, string> = {
  Queued: 'En cola',
  Running: 'Procesando',
  PausedBudget: 'Pausado por el tope',
  PausedUnavailable: 'Pausado',
  Done: 'Terminado',
  Cancelled: 'Cancelado',
};

export const JOB_STATUS_TONE: Record<
  AiCatalogJobStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  Queued: 'neutral',
  Running: 'info',
  PausedBudget: 'warning',
  PausedUnavailable: 'warning',
  Done: 'success',
  Cancelled: 'neutral',
};

/** Las pestañas de la revisión, en el orden en que se las recorre. */
export const ITEM_TABS: { id: AiCatalogItemStatus; label: string }[] = [
  { id: 'Review', label: 'Para revisar' },
  { id: 'NeedsCategory', label: 'Elegí la categoría' },
  { id: 'Approved', label: 'Aprobados' },
  { id: 'Discarded', label: 'Descartados' },
  { id: 'Failed', label: 'Con error' },
];

/** Productos por página de la revisión. */
export const ITEMS_PAGE_SIZE = 25;

/** En cola o procesando: el panel vuelve a preguntar solo. */
export function jobInFlight(status: AiCatalogJobStatus | undefined): boolean {
  return status === 'Queued' || status === 'Running';
}

export function jobPaused(status: AiCatalogJobStatus | undefined): boolean {
  return status === 'PausedBudget' || status === 'PausedUnavailable';
}

/** Se puede cancelar mientras ocupa el lugar de trabajo de la tienda. */
export function jobCancellable(status: AiCatalogJobStatus | undefined): boolean {
  return jobInFlight(status) || jobPaused(status);
}

/** Cómo se nombra un dato que falta: "GTIN (obligatorio)". */
export function missingLabel(m: Pick<AiCatalogMissing, 'name' | 'required'>): string {
  return m.required ? `${m.name} (obligatorio)` : m.name;
}

/** "3 productos", "1 producto". */
export function productsLabel(count: number): string {
  return `${count} ${count === 1 ? 'producto' : 'productos'}`;
}
