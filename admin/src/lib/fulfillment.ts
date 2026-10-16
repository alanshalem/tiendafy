/**
 * Despacho (GET/POST /api/v1/fulfillment/…): tipos del backend y lo que el
 * panel sabe de cada carrier.
 */

export type CarrierId = 'andreani' | 'zipnova' | 'correo' | 'retiro' | 'propio';

export const CARRIERS: Record<CarrierId, string> = {
  andreani: 'Andreani',
  zipnova: 'Zipnova',
  correo: 'Correo Argentino',
  retiro: 'Retiro en el local',
  propio: 'Envío propio / otro',
};

export interface QueueOrder {
  id: string;
  number: string;
  createdAtUtc: string;
  paidAtUtc: string | null;
  buyerEmail: string;
  buyerName: string | null;
  shippingMethodName: string | null;
  shippingAddress: string | null;
  isPickup: boolean;
  carrier: CarrierId;
  shipment: { carrier: CarrierId; tracking: string | null; hasLabel: boolean } | null;
  units: number;
  lines: number;
  notes: string | null;
}

export interface QueueResponse {
  items: QueueOrder[];
  total: number;
  byCarrier: Partial<Record<CarrierId, number>>;
}

interface PickLine {
  variantId: string;
  sku: string;
  productName: string;
  variantDescription: string;
  location: string | null;
  quantity: number;
  orders: { orderId: string; number: string; quantity: number }[];
}

export interface PickList {
  lines: PickLine[];
  orders: number;
  units: number;
  skipped: { orderId: string; reason: string }[];
}

type LabelStatus = 'ok' | 'sin-envio' | 'no-soportado' | 'error';

export interface LabelBatch {
  results: {
    orderId: string;
    number: string;
    carrier: CarrierId | null;
    status: LabelStatus;
    reason: string | null;
  }[];
  ok: number;
  missing: number;
  fileName: string | null;
  pdfBase64: string | null;
}

export interface DispatchOrder {
  id: string;
  number: string;
  status: string;
  buyerEmail: string;
  buyerName: string | null;
  shippingMethodName: string | null;
  shippingAddress: string | null;
  isPickup: boolean;
  carrier: CarrierId;
  tracking: string | null;
  items: {
    variantId: string;
    productName: string;
    variantDescription: string;
    sku: string;
    barcode: string | null;
    location: string | null;
    quantity: number;
  }[];
}

/** Tope del backend por lista de picking, etiquetas o remitos. */
export const MAX_BATCH = 100;

export function base64ToBlob(base64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * La lista de picking como una hoja para imprimir, en una ventana aparte:
 * imprimir la pantalla del panel saca el menú, los filtros y los botones.
 */
export function pickListHtml(list: PickList, storeName: string): string {
  const rows = list.lines
    .map(
      (l) => `<tr>
  <td class="box"></td>
  <td>${escapeHtml(l.location ?? '—')}</td>
  <td>${escapeHtml(l.productName)}${
    l.variantDescription && l.variantDescription !== 'Única'
      ? ` <span class="muted">· ${escapeHtml(l.variantDescription)}</span>`
      : ''
  }<br><span class="muted">${escapeHtml(l.sku)}</span></td>
  <td class="qty">${l.quantity}</td>
  <td class="muted">${l.orders.map((o) => `${escapeHtml(o.number)}×${o.quantity}`).join(', ')}</td>
</tr>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de picking</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#111}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11px;color:#666;border-bottom:1px solid #999;padding:6px}
td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top}
.box{width:14px}.box::before{content:"";display:inline-block;width:12px;height:12px;border:1px solid #333}
.qty{text-align:right;font-weight:700;font-size:15px}.muted{color:#777;font-size:11px}
</style></head><body>
<h1>Lista de picking · ${escapeHtml(storeName)}</h1>
<p>${list.orders} pedidos · ${list.units} unidades · ${new Date().toLocaleString('es-AR')}</p>
<table><thead><tr><th></th><th>Ubicación</th><th>Producto</th><th style="text-align:right">Cant.</th><th>Pedidos</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}
