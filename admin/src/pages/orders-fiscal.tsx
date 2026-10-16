import { useState } from 'react';
import { RefreshCw, FileText, Download, Undo2 } from 'lucide-react';
import { useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { formatMoney } from '../lib/format';
import { InvoiceDialog, type InvoiceBuyer } from './orders-invoice-dialog';
import { CreditNoteDialog, type CreditNoteRequest } from './orders-credit-note-dialog';
import { useServerLoad } from '../lib/useServerLoad';
import { orderNumber } from '../lib/orderNumber';
import { useFiscalReady } from '../lib/useFiscalReady';
import { SetupInvoicingLink } from '../components/SetupInvoicingLink';

interface FiscalDoc {
  id: string;
  cbteTipo: string;
  ptoVta: number;
  number: number;
  result: string;
  cae: string | null;
  caeVto: string | null;
  errors: string | null;
  /** Total del comprobante, en pesos. */
  impTotal: number;
  /** HOMOLOGACION | PRODUCCION. */
  environment?: string;
}
interface FiscalJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  /** En centavos (lo que acredita, si es una nota de crédito). */
  amount?: number;
}
/** Lo acreditado de la factura frente a lo devuelto, en centavos. */
export interface CreditSummary {
  invoiceTotal: number;
  credited: number;
  inFlight: number;
  remaining: number;
  refunded: number;
  refundedUncredited: number;
}
export interface FiscalStatus {
  /** En qué ambiente factura hoy la tienda (null sin configurar). */
  environment?: string | null;
  /** La tienda emite sola: la nota de crédito de un reembolso sale sin pedirla. */
  autoInvoice?: boolean;
  documents: FiscalDoc[];
  jobs: FiscalJob[];
  /** Null si la venta no tiene factura en el ambiente actual. */
  credit?: CreditSummary | null;
}

const CBTE_LABEL: Record<string, string> = {
  FacturaA: 'Factura A',
  FacturaB: 'Factura B',
  FacturaC: 'Factura C',
  NotaCreditoA: 'NC A',
  NotaCreditoB: 'NC B',
  NotaCreditoC: 'NC C',
};
const nro = (d: FiscalDoc) => `${String(d.ptoVta).padStart(4, '0')}-${String(d.number).padStart(8, '0')}`;
const isNc = (t: string) => t.startsWith('NotaCredito');
const HOMOLOGACION = 'HOMOLOGACION';

/**
 * Estado fiscal (ARCA) de una orden: la factura y sus notas de crédito, con
 * facturar, reintentar y emitir una nota de crédito.
 */
export function FiscalPanel({
  orderId,
  orderStatus,
  buyerDoc,
  canEmit,
  currency = 'ARS',
  refunded = 0,
}: {
  orderId: string;
  orderStatus: string;
  /** El DNI/CUIT que dejó el comprador: el diálogo de facturación arranca con él. */
  buyerDoc: string | null;
  canEmit: boolean;
  currency?: string;
  /** Lo devuelto de la venta (centavos): si cambia, se vuelve a pedir el estado. */
  refunded?: number;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<FiscalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const fiscalReady = useFiscalReady();

  const { loading, reload: load } = useServerLoad(
    `${orderId}|${orderStatus}|${refunded}`,
    () => api.get<FiscalStatus>(`/api/v1/orders/${orderId}/fiscal`),
    setData,
    () => setData(null),
  );

  // Solo cuenta lo del ambiente en que factura hoy la tienda: una factura de
  // homologación no existe para ARCA de producción, y la venta se puede
  // facturar de verdad. La de prueba se muestra aparte, dicha como tal.
  const env = data?.environment ?? null;
  const docs = data?.documents ?? [];
  const current = docs.filter((d) => !env || !d.environment || d.environment === env);
  const invoice = current.find((d) => !isNc(d.cbteTipo) && d.result === 'Authorized');
  const otherEnvInvoice = docs.find(
    (d) => !current.includes(d) && !isNc(d.cbteTipo) && d.result === 'Authorized',
  );
  // Se pidió el CAE y la respuesta no llegó: puede estar autorizado del lado de
  // ARCA. Mientras tanto no se ofrece "Facturar ahora": emitir otra vez es
  // exactamente la factura duplicada que se quiere evitar.
  const awaiting = current.find((d) => !isNc(d.cbteTipo) && d.result === 'Pending');
  // Una venta puede tener varias notas de crédito: una por reembolso o ajuste.
  const creditNotes = current.filter((d) => isNc(d.cbteTipo) && d.result === 'Authorized');
  const creditAwaiting = current.filter((d) => isNc(d.cbteTipo) && d.result === 'Pending');
  const testing = env === HOMOLOGACION;
  const jobs = data?.jobs ?? [];
  const invoiceJobs = jobs.filter((j) => j.kind !== 'CreditNote');
  const creditJobs = jobs.filter((j) => j.kind === 'CreditNote');
  const failedJob = invoiceJobs.find((j) => j.status === 'Failed');
  const activeJob = invoiceJobs.find((j) => j.status === 'Pending' || j.status === 'Processing');
  const failedCredit = creditJobs.find((j) => j.status === 'Failed');
  const creditInQueue = creditJobs.filter((j) => j.status === 'Pending' || j.status === 'Processing');
  const credit = data?.credit ?? null;
  const payable = orderStatus === 'PAID' || orderStatus === 'FULFILLED';

  const emit = async (buyer: InvoiceBuyer) => {
    setBusy(true);
    try {
      const r = await api.post<{
        authorized: boolean;
        cae: string | null;
        errors?: { code: string; message: string }[];
      }>(`/api/v1/orders/${orderId}/invoice`, buyer);
      setInvoicing(false);
      toast(
        r.authorized
          ? `Factura autorizada · CAE ${r.cae}`
          : `Rechazada por ARCA: ${r.errors?.map((e) => e.message).join(' · ') || 'sin detalle'}`,
        { variant: r.authorized ? 'success' : 'error' },
      );
      await load();
    } catch (e) {
      toast(errMsg(e, 'No se pudo facturar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async (nc?: FiscalDoc) => {
    try {
      const blob = await api.download(
        `/api/v1/orders/${orderId}/invoice.pdf${nc ? `?type=creditnote&document=${nc.id}` : ''}`,
      );
      // El archivo lleva el número de la venta (sin el "#"), el mismo que ve el comprador.
      downloadBlob(blob, `comprobante-${orderNumber(orderId).slice(1)}${nc ? `-nc-${nc.number}` : ''}.pdf`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo descargar el comprobante.'), { variant: 'error' });
    }
  };

  const issueCreditNote = async (req: CreditNoteRequest) => {
    setBusy(true);
    try {
      const r = await api.post<{
        queued: boolean;
        authorized: boolean;
        cae: string | null;
        errors?: { code: string; message: string }[];
      }>(`/api/v1/orders/${orderId}/credit-notes`, req);
      setCrediting(false);
      toast(
        r.authorized
          ? `Nota de crédito autorizada · CAE ${r.cae}`
          : r.queued
            ? 'ARCA no contestó: la nota de crédito quedó en la cola y sale sola en unos minutos.'
            : `Rechazada por ARCA: ${r.errors?.map((e) => e.message).join(' · ') || 'sin detalle'}`,
        { variant: r.authorized ? 'success' : r.queued ? 'info' : 'error' },
      );
      await load();
    } catch (e) {
      toast(errMsg(e, 'No se pudo emitir la nota de crédito.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const retry = async (job: FiscalJob | undefined) => {
    if (!job) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/fiscal/jobs/${job.id}/retry`, {});
      toast('Reintento encolado', { variant: 'success' });
      await load();
    } catch (e) {
      toast(errMsg(e, 'No se pudo reintentar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-bg px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg">
        <FileText className="h-3.5 w-3.5" /> Facturación (ARCA)
      </div>
      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Spinner inline size={14} /> Cargando…
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          {invoice ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-success">
                {CBTE_LABEL[invoice.cbteTipo] ?? invoice.cbteTipo} {nro(invoice)} · CAE {invoice.cae}
                {invoice.caeVto ? ` (vence ${invoice.caeVto})` : ''}
              </span>
              {testing && <span className="text-fg-muted">· de prueba (homologación)</span>}
              <button
                onClick={() => downloadPdf()}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-2xs font-medium text-fg hover:bg-bg-muted"
              >
                <Download className="h-3 w-3" /> PDF
              </button>
            </div>
          ) : awaiting ? (
            <div className="text-warning">
              Esperando confirmación de ARCA para el {CBTE_LABEL[awaiting.cbteTipo] ?? awaiting.cbteTipo}{' '}
              {nro(awaiting)}: la respuesta no llegó y el próximo intento verifica con ARCA si quedó
              autorizado, para no facturar dos veces.
            </div>
          ) : activeJob ? (
            <div className="flex items-center gap-1.5 text-warning">
              <Spinner inline size={14} /> Facturación en proceso…
            </div>
          ) : failedJob ? (
            <div className="text-danger">
              Falló la facturación automática{failedJob.lastError ? `: ${failedJob.lastError}` : ''}
            </div>
          ) : (
            <div className="text-fg-muted">Sin factura para esta orden.</div>
          )}
          {otherEnvInvoice && (
            <div className="text-fg-muted">
              {otherEnvInvoice.environment === HOMOLOGACION
                ? `La ${CBTE_LABEL[otherEnvInvoice.cbteTipo] ?? otherEnvInvoice.cbteTipo} ${nro(otherEnvInvoice)} es de homologación: de prueba, sin validez fiscal. No cuenta en producción.`
                : `La ${CBTE_LABEL[otherEnvInvoice.cbteTipo] ?? otherEnvInvoice.cbteTipo} ${nro(otherEnvInvoice)} es de producción: no cuenta mientras la tienda factura en homologación.`}
            </div>
          )}
          {creditNotes.map((nc) => (
            <div key={nc.id} className="flex items-center gap-2">
              <span className="font-medium text-info">
                {CBTE_LABEL[nc.cbteTipo] ?? nc.cbteTipo} {nro(nc)} ·{' '}
                {formatMoney(Math.round(nc.impTotal * 100), currency)} · CAE {nc.cae}
              </span>
              <button
                onClick={() => downloadPdf(nc)}
                aria-label={`PDF de la ${CBTE_LABEL[nc.cbteTipo] ?? nc.cbteTipo} ${nro(nc)}`}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-2xs font-medium text-fg hover:bg-bg-muted"
              >
                <Download className="h-3 w-3" /> PDF
              </button>
            </div>
          ))}
          {(creditInQueue.length > 0 || creditAwaiting.length > 0) && (
            <div className="flex items-center gap-1.5 text-warning">
              <Spinner inline size={14} /> Nota de crédito en proceso…
            </div>
          )}
          {failedCredit && (
            <div className="text-danger">
              Falló la nota de crédito{failedCredit.lastError ? `: ${failedCredit.lastError}` : ''}
            </div>
          )}
          {invoice && credit && credit.refundedUncredited > 0 && (
            <div className="rounded border border-warning/40 bg-warning-bg px-2 py-1 text-warning">
              Hay {formatMoney(credit.refundedUncredited, currency)} devueltos sin nota de crédito.
            </div>
          )}
          {canEmit && failedCredit && (
            <button
              onClick={() => retry(failedCredit)}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
            >
              {busy ? <Spinner inline size={14} /> : <RefreshCw className="h-3.5 w-3.5" />} Reintentar la nota
              de crédito
            </button>
          )}
          {canEmit && invoice && credit && credit.remaining > 0 && (
            <button
              onClick={() => setCrediting(true)}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Emitir nota de crédito
            </button>
          )}
          {canEmit && !invoice && !awaiting && payable && !fiscalReady && (
            <SetupInvoicingLink compact className="mt-1" />
          )}
          {canEmit && !invoice && !awaiting && payable && fiscalReady && (
            <button
              onClick={() => setInvoicing(true)}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Spinner inline size={14} /> : <FileText className="h-3.5 w-3.5" />} Facturar ahora
            </button>
          )}
          {canEmit && failedJob && !invoice && (
            <button
              onClick={() => retry(failedJob)}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
            >
              {busy ? <Spinner inline size={14} /> : <RefreshCw className="h-3.5 w-3.5" />} Reintentar
            </button>
          )}
        </div>
      )}

      {crediting && invoice && credit && (
        <CreditNoteDialog
          invoiceLabel={`${CBTE_LABEL[invoice.cbteTipo] ?? invoice.cbteTipo} ${nro(invoice)}`}
          currency={currency}
          remaining={credit.remaining}
          refundedUncredited={credit.refundedUncredited}
          busy={busy}
          onClose={() => setCrediting(false)}
          onConfirm={issueCreditNote}
        />
      )}
      {invoicing && (
        <InvoiceDialog
          open
          initialDoc={buyerDoc}
          busy={busy}
          onClose={() => setInvoicing(false)}
          onConfirm={emit}
        />
      )}
    </div>
  );
}
