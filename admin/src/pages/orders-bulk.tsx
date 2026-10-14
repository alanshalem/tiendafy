import { useState } from 'react';
import { Download, FileText, Loader2, Printer, Tag, Truck, X } from 'lucide-react';
import { cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { formatDateTime } from '../lib/format';
import { orderNumber } from '../lib/orderNumber';
import { useFiscalReady } from '../lib/useFiscalReady';
import { SetupInvoicingLink } from '../components/SetupInvoicingLink';
import type { Order } from './Orders';

/** Qué pasó con cada venta de una acción en lote. */
export interface BulkReport {
  /** "3 facturadas · 1 ya estaba · 2 no se pudieron" */
  summary: string;
  items: { id: string; number: string; result: 'ok' | 'skipped' | 'failed'; reason: string | null }[];
}

/** Lo que devuelve /orders/bulk/fulfill. */
interface BulkFulfillResult {
  fulfilled: number;
  skipped: number;
  failed: number;
  results: {
    id: string;
    number: string;
    result: 'fulfilled' | 'skipped' | 'failed';
    reason: string | null;
  }[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 marcadas como enviadas · 1 ya estaba · 2 no se pudieron" */
function fulfillSummary(r: BulkFulfillResult): string {
  const parts = [
    `${r.fulfilled} ${r.fulfilled === 1 ? 'marcada' : 'marcadas'} como ${r.fulfilled === 1 ? 'enviada' : 'enviadas'}`,
  ];
  if (r.skipped > 0) parts.push(`${r.skipped} ya ${r.skipped === 1 ? 'estaba enviada' : 'estaban enviadas'}`);
  if (r.failed > 0) parts.push(`${r.failed} no se ${r.failed === 1 ? 'pudo' : 'pudieron'} marcar`);
  return parts.join(' · ');
}

function countSummary(items: BulkReport['items'], done: [string, string], skipped: string): string {
  const ok = items.filter((i) => i.result === 'ok').length;
  const skip = items.filter((i) => i.result === 'skipped').length;
  const failed = items.filter((i) => i.result === 'failed').length;
  const parts = [plural(ok, done[0], done[1])];
  if (skip > 0) parts.push(`${skip} ${skipped}`);
  if (failed > 0) parts.push(`${failed} no se ${failed === 1 ? 'pudo' : 'pudieron'}`);
  return parts.join(' · ');
}

/**
 * La barra de lo elegido en Ventas: marcar enviadas, imprimir etiquetas y
 * remitos, facturar y exportar. Cada acción cuenta qué pasó con cada venta
 * (ver BulkReportPanel): "listo" para 8 de 10 sin decir cuáles dos no, no
 * sirve para trabajar.
 */
export function OrdersBulkBar({
  selected,
  storeName,
  canFulfill,
  canEmit,
  onReport,
  onKeepSelected,
  onClear,
  reload,
}: {
  selected: Order[];
  storeName: string;
  canFulfill: boolean;
  canEmit: boolean;
  onReport: (report: BulkReport) => void;
  /** Deja elegidas solo estas (las que fallaron, para reintentar o revisarlas). */
  onKeepSelected: (ids: Set<string>) => void;
  onClear: () => void;
  reload: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const fiscalReady = useFiscalReady();
  const [busy, setBusy] = useState<null | 'fulfill' | 'labels' | 'invoice' | 'export'>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const ids = selected.map((o) => o.id);
  const count = selected.length;

  const keepFailed = (report: BulkReport) =>
    onKeepSelected(new Set(report.items.filter((i) => i.result === 'failed').map((i) => i.id)));

  const fulfill = async () => {
    const ok = await confirm({
      title: `Marcar ${plural(count, 'venta', 'ventas')} como enviadas`,
      message:
        'Le avisamos a cada comprador (a los que retiran en el local, que su pedido está listo). Va sin código de seguimiento: si hace falta, se carga después en cada venta. Las que no estén cobradas o ya estén enviadas quedan como están.',
      confirmLabel: 'Marcar enviadas',
    });
    if (!ok) return;
    setBusy('fulfill');
    try {
      const res = await api.post<BulkFulfillResult>('/api/v1/orders/bulk/fulfill', { ids });
      const report: BulkReport = {
        summary: fulfillSummary(res),
        items: res.results.map((r) => ({
          id: r.id,
          number: r.number,
          result: r.result === 'fulfilled' ? 'ok' : r.result,
          reason: r.reason,
        })),
      };
      onReport(report);
      keepFailed(report);
      toast(report.summary, { variant: res.failed > 0 ? 'error' : 'success' });
      await reload();
    } catch (e) {
      toast(errMsg(e, 'No se pudieron marcar las ventas.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // Etiquetas: las que ya generó un carrier con etiqueta descargable (Zipnova
  // o Andreani). Una venta sin envío generado no tiene etiqueta que imprimir:
  // se avisa cuál, para generarla desde su detalle.
  const labels = async () => {
    setBusy('labels');
    const items: BulkReport['items'] = [];
    try {
      for (const [index, o] of selected.entries()) {
        setProgress(`Etiqueta ${index + 1} de ${count}…`);
        const number = orderNumber(o.id);
        if (o.isPickup) {
          items.push({
            id: o.id,
            number,
            result: 'skipped',
            reason: 'Se retira en el local: no lleva etiqueta.',
          });
          continue;
        }
        try {
          const label = await findLabel(o.id);
          if (!label) {
            items.push({
              id: o.id,
              number,
              result: 'failed',
              reason: 'No tiene un envío de Zipnova o Andreani generado: generalo desde su detalle.',
            });
            continue;
          }
          const blob = await api.download(label.path);
          downloadBlob(blob, `etiqueta-${number.slice(1)}-${label.carrier}.pdf`);
          items.push({ id: o.id, number, result: 'ok', reason: null });
        } catch (e) {
          items.push({
            id: o.id,
            number,
            result: 'failed',
            reason: errMsg(e, 'No se pudo bajar la etiqueta.'),
          });
        }
      }
      const report = {
        summary: countSummary(items, ['etiqueta bajada', 'etiquetas bajadas'], 'se retiran'),
        items,
      };
      onReport(report);
      toast(report.summary, { variant: items.some((i) => i.result === 'failed') ? 'error' : 'success' });
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  const slips = () => {
    if (!printPackingSlips(selected, storeName))
      toast('El navegador bloqueó la ventana de impresión: permití las ventanas emergentes para el panel.', {
        variant: 'error',
      });
  };

  // Facturar de a una, en orden: el emisor ya no factura dos veces la misma
  // venta, así que reintentar después de un corte no duplica nada.
  const invoice = async () => {
    const eligible = selected.filter((o) => o.status === 'PAID' || o.status === 'FULFILLED');
    const ok = await confirm({
      title: `Facturar ${plural(eligible.length, 'venta', 'ventas')}`,
      message: `Se emite una factura electrónica real en ARCA por cada venta cobrada, con el documento que dejó el comprador.${
        eligible.length < count
          ? ` ${plural(count - eligible.length, 'venta elegida no está cobrada', 'ventas elegidas no están cobradas')} y se saltea${count - eligible.length === 1 ? '' : 'n'}.`
          : ''
      } Las que ya tengan factura no se vuelven a facturar.`,
      confirmLabel: 'Facturar',
    });
    if (!ok) return;
    setBusy('invoice');
    const items: BulkReport['items'] = [];
    try {
      for (const [index, o] of selected.entries()) {
        const number = orderNumber(o.id);
        if (o.status !== 'PAID' && o.status !== 'FULFILLED') {
          items.push({ id: o.id, number, result: 'skipped', reason: 'No está cobrada.' });
          continue;
        }
        setProgress(`Facturando ${index + 1} de ${count}…`);
        try {
          const r = await api.post<{
            authorized: boolean;
            cae: string | null;
            errors?: { message: string }[];
          }>(`/api/v1/orders/${o.id}/invoice`, {});
          items.push(
            r.authorized
              ? { id: o.id, number, result: 'ok', reason: null }
              : {
                  id: o.id,
                  number,
                  result: 'failed',
                  reason: `ARCA la rechazó: ${r.errors?.map((e) => e.message).join(' · ') || 'sin detalle'}`,
                },
          );
        } catch (e) {
          const message = errMsg(e, 'No se pudo facturar.');
          items.push({
            id: o.id,
            number,
            result: /ya tiene una factura/i.test(message) ? 'skipped' : 'failed',
            reason: message,
          });
        }
      }
      const report = { summary: countSummary(items, ['facturada', 'facturadas'], 'salteadas'), items };
      onReport(report);
      keepFailed(report);
      toast(report.summary, { variant: items.some((i) => i.result === 'failed') ? 'error' : 'success' });
      await reload();
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    setBusy('export');
    try {
      const blob = await api.download(`/api/v1/orders/export?ids=${ids.join(',')}`);
      downloadBlob(blob, `ventas-seleccion-${count}.csv`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo exportar.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const button =
    'inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50';

  return (
    <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur-xl">
      <span className="text-sm font-semibold text-primary" aria-live="polite">
        {count} {count === 1 ? 'seleccionada' : 'seleccionadas'}
        {progress && <span className="ml-2 font-normal text-fg-muted">{progress}</span>}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {canFulfill && (
          <button
            type="button"
            disabled={!!busy}
            onClick={fulfill}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {busy === 'fulfill' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Truck className="h-4 w-4" />
            )}{' '}
            Marcar como enviadas
          </button>
        )}
        {canFulfill && (
          <button type="button" disabled={!!busy} onClick={labels} className={button}>
            {busy === 'labels' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}{' '}
            Etiquetas
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={slips} className={button}>
          <Printer className="h-4 w-4" /> Remitos
        </button>
        {canEmit &&
          (fiscalReady ? (
            <button type="button" disabled={!!busy} onClick={invoice} className={button}>
              {busy === 'invoice' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}{' '}
              Facturar
            </button>
          ) : (
            <SetupInvoicingLink className="h-9" />
          ))}
        <button type="button" disabled={!!busy} onClick={exportCsv} className={button}>
          {busy === 'export' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}{' '}
          Exportar
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg-muted hover:text-fg"
        >
          <X className="h-4 w-4" /> Deseleccionar
        </button>
      </div>
    </div>
  );
}

/** La etiqueta de un carrier ya generada para la venta, si hay una. */
async function findLabel(orderId: string): Promise<{ carrier: string; path: string } | null> {
  for (const carrier of ['zipnova', 'andreani']) {
    const state = await api
      .get<{ exists?: boolean }>(`/api/v1/admin/orders/${orderId}/${carrier}-shipment`)
      .catch(() => null);
    if (state && state.exists !== false)
      return { carrier, path: `/api/v1/admin/orders/${orderId}/${carrier}-label` };
  }
  return null;
}

/** Lo que pasó con el lote, con el motivo de cada una que no salió. */
export function BulkReportPanel({ report, onClose }: { report: BulkReport; onClose: () => void }) {
  const notOk = report.items.filter((r) => r.result !== 'ok' && r.reason);
  const failed = report.items.some((r) => r.result === 'failed');
  return (
    <div
      role="status"
      className={cn(
        'mb-3 rounded-lg border px-4 py-3 text-sm',
        failed ? 'border-warning/40 bg-warning-bg' : 'border-success/40 bg-success/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-fg">{report.summary}.</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el resumen"
          className="rounded p-0.5 text-fg-muted hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {notOk.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-fg-muted">
          {notOk.map((r) => (
            <li key={r.id}>
              <span className="font-mono font-semibold text-fg">{r.number}</span>: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Remitos -----------------------------------------------------------------

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Remitos para armar los paquetes: uno por hoja, con a quién va, a dónde y
 * qué lleva (sin precios: el remito viaja dentro de la caja). Es HTML
 * imprimible en una ventana aparte; el navegador ofrece imprimir o guardar
 * como PDF. Devuelve false si el navegador bloqueó la ventana.
 */
export function printPackingSlips(orders: Order[], storeName: string): boolean {
  // La ventana se abre en el mismo click (sin esperar nada antes): si no,
  // el navegador la toma por una ventana emergente y la bloquea.
  const win = window.open('', '_blank');
  if (!win) return false;

  const slips = orders
    .map((o) => {
      const rows = o.items
        .map(
          (i) =>
            `<tr><td class="qty">${i.quantity}</td><td>${esc(i.productName)}${
              i.variantDescription ? ` <span class="muted">· ${esc(i.variantDescription)}</span>` : ''
            }</td><td class="sku">${esc(i.sku)}</td><td class="check"></td></tr>`,
        )
        .join('');
      const units = o.items.reduce((sum, i) => sum + i.quantity, 0);
      const destination = o.isPickup
        ? `<p><strong>Retira en el local</strong>${o.shippingMethod ? ` · ${esc(o.shippingMethod)}` : ''}</p>`
        : `<p>${esc(o.shippingAddress) || '<span class="muted">Sin dirección cargada</span>'}</p>${
            o.shippingMethod ? `<p class="muted">${esc(o.shippingMethod)}</p>` : ''
          }`;
      return `<section class="slip">
  <header><div><h1>Remito ${esc(orderNumber(o.id))}</h1><p class="muted">${esc(storeName)} · ${esc(
    formatDateTime(o.createdAtUtc),
  )}</p></div></header>
  <div class="cols">
    <div><h2>Para</h2><p><strong>${esc(o.buyerName || o.buyerEmail)}</strong></p>
      ${o.buyerPhone ? `<p>${esc(o.buyerPhone)}</p>` : ''}${o.docNumber ? `<p>DNI/CUIT ${esc(o.docNumber)}</p>` : ''}</div>
    <div><h2>${o.isPickup ? 'Entrega' : 'Envío'}</h2>${destination}${
      o.tracking ? `<p>Seguimiento: ${esc(o.tracking)}</p>` : ''
    }</div>
  </div>
  <table><thead><tr><th>Cant.</th><th>Producto</th><th>SKU</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="total">${units} ${units === 1 ? 'unidad' : 'unidades'}</p>
  ${o.notes ? `<p class="notes">Nota: ${esc(o.notes)}</p>` : ''}
</section>`;
    })
    .join('');

  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Remitos (${orders.length})</title>
<style>
  body { font: 13px/1.45 system-ui, sans-serif; color: #111; margin: 0; }
  .slip { padding: 24px 28px; page-break-after: always; break-after: page; }
  .slip:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 0 0 4px; }
  p { margin: 2px 0; } .muted { color: #666; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; padding: 12px; border: 1px solid #ccc; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; color: #555; } .qty { width: 48px; font-weight: 700; } .sku { font-family: ui-monospace, monospace; font-size: 12px; } .check { width: 28px; }
  .total { margin-top: 10px; font-weight: 600; } .notes { margin-top: 10px; font-style: italic; }
</style></head><body>${slips}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
