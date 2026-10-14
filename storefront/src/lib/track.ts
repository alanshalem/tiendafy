/**
 * Eventos del embudo de compra para los píxeles de la tienda (ver
 * TrackingTags). Los componentes avisan QUÉ pasó; TrackingTags decide si se
 * manda y a quién, con las mismas reglas que para cargar los scripts:
 * permiso del visitante, nunca en la página de pago.
 *
 * Lo que llega antes de que se sepa si se puede medir (la configuración
 * todavía no bajó) espera en una cola corta; si la respuesta es "no", se
 * descarta.
 */

export interface TrackItem {
  /** Id de la variante: es lo que se vende. */
  id: string;
  name: string;
  variant?: string;
  /** Centavos, como en el resto de la tienda; se convierte al mandar. */
  price: number;
  currency: string;
  quantity: number;
}

export type FunnelEvent =
  | { type: 'view_item'; item: TrackItem }
  | { type: 'add_to_cart'; item: TrackItem }
  | { type: 'begin_checkout'; items: TrackItem[] };

type Sink = (e: FunnelEvent) => void;

const MAX_PENDING = 20;
let sink: Sink | null = null;
const pending: FunnelEvent[] = [];

export function track(event: FunnelEvent): void {
  if (sink) {
    sink(event);
    return;
  }
  pending.push(event);
  if (pending.length > MAX_PENDING) pending.shift();
}

/**
 * Quién recibe los eventos. `null` = todavía no se sabe (encolar); un sink
 * que no hace nada = no se mide (y la cola se tira).
 */
export function setTrackSink(next: Sink | null): void {
  sink = next;
  if (!next) return;
  const queued = pending.splice(0, pending.length);
  for (const e of queued) next(e);
}

/** Lo que vale un conjunto de ítems, en la unidad que esperan los píxeles (pesos). */
export const valueOf = (items: TrackItem[]): number =>
  Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0)) / 100;
