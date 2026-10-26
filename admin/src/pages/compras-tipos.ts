import type { BadgeVariant } from '@tiendafy/ui';

/**
 * Lo que la API de compras devuelve, y las etiquetas que el panel le pone.
 *
 * Vive aparte porque lo comparten las cuatro pantallas del modulo —el
 * listado, el editor de la orden, la factura del proveedor y la recepcion—.
 * Mientras estaba adentro de una de ellas, cualquiera de las otras tenia que
 * importar desde un archivo de mil quinientas lineas para conocer una forma.
 */

export interface PoListItem {
  id: string;
  supplierName: string;
  reference: string | null;
  status: string;
  currency: string;
  totalFob: number;
  items: number;
  units: number;
  createdAtUtc: string;
  leadTimeDays: number | null;
}

interface PoItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number | null;
  landedUnitCostArsMinor: number;
}

export interface PoDetail {
  id: string;
  supplierId: string | null;
  supplierName: string;
  reference: string | null;
  notes: string | null;
  status: string;
  currency: string;
  exchangeRate: number;
  leadTimeDays: number | null;
  createdAtUtc: string;
  totalFob: number;
  totalExpensesArs: number;
  supplierTaxId: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
  invoiceDateUtc: string | null;
  invoiceNetArs: number | null;
  invoiceVatArs: number | null;
  items: PoItem[];
  expenses: { label: string; amount: number; isLocal: boolean }[];
}

export interface Suggestion {
  variantId: string;
  product: string;
  variant: string;
  sku: string;
  unitsPerDay: number;
  available: number;
  coverageDays: number;
  suggestedQty: number;
}

export const PO_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Borrador', variant: 'neutral' },
  CONFIRMED: { label: 'Confirmada', variant: 'info' },
  INPRODUCTION: { label: 'En producción', variant: 'info' },
  INTRANSIT: { label: 'En tránsito', variant: 'warning' },
  INCUSTOMS: { label: 'En aduana', variant: 'warning' },
  RECEIVED: { label: 'Recibida', variant: 'success' },
  CANCELLED: { label: 'Cancelada', variant: 'danger' },
};

/** Próximos pasos posibles del ciclo, por estado actual (Recibir va aparte). */
export const NEXT_STEPS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['INPRODUCTION', 'INTRANSIT'],
  INPRODUCTION: ['INTRANSIT'],
  INTRANSIT: ['INCUSTOMS'],
  INCUSTOMS: [],
};

// Draft del form (montos como strings — se parsean al guardar).
export interface FormItem {
  variantId: string;
  label: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

export interface FormExpense {
  label: string;
  amount: string;
  isLocal: boolean;
}

export interface PoForm {
  supplierId: string;
  supplierName: string;
  reference: string;
  notes: string;
  currency: string;
  exchangeRate: string;
  leadTimeDays: string;
  items: FormItem[];
  expenses: FormExpense[];
}

/** Órdenes de compra por página. */
export const PO_PAGE_SIZE = 25;

/** Estado agregado de las compras (`GET /purchasing/summary`). */
export interface PurchasingSummary {
  total: number;
  open: number;
  inTransit: number;
  received: number;
  committedFob: number;
  currency: string;
  withoutInvoice: number;
}

/** Cómo se emparejó una línea de la factura con un ítem de la orden. */
export type LineMatchMethod = 'code' | 'description' | 'ai' | 'none';

export const MATCH_LABEL: Record<LineMatchMethod, string> = {
  code: 'por código',
  description: 'por descripción',
  ai: 'elegido por la IA',
  none: 'sin emparejar',
};

export interface ScannedInvoiceLine {
  description: string;
  code: string | null;
  quantity: number | null;
  unitPrice: number | null;
  match: {
    variantId: string | null;
    method: LineMatchMethod;
    confidence: 'alta' | 'media' | 'baja';
    /** Variantes de la orden entre las que dudó, la más parecida primero. */
    candidates: string[];
  };
}

export interface ScannedInvoice {
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
  invoiceDateUtc: string | null;
  currency: string;
  netAmount: number | null;
  vatAmount: number | null;
  /** No gravado, exento, percepciones e impuestos internos: lo que suma al total sin ser neto ni IVA. */
  otherAmount: number | null;
  totalAmount: number | null;
  confidence: string;
  warnings: string[];
  /** Lo que sigue sin cerrar después de la segunda lectura, con los números tal cual se leyeron. */
  checks: { code: string; message: string }[];
  /** La IA releyó la factura porque algo no cerraba. */
  correctionRound: boolean;
  lines: ScannedInvoiceLine[];
  currencyMismatch: boolean;
}

export const CONFIDENCE_TONE: Record<string, BadgeVariant> = {
  alta: 'success',
  media: 'warning',
  baja: 'danger',
};
