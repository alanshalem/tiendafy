import { useState } from 'react';
import { Loader2, RefreshCw, FileText, Download } from 'lucide-react';
import { useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { InvoiceDialog, type InvoiceBuyer } from './orders-invoice-dialog';
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
}
interface FiscalJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
}
interface FiscalStatus {
  documents: FiscalDoc[];
  jobs: FiscalJob[];
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

/** Estado fiscal (ARCA) de una orden: comprobantes + jobs, con facturar/reintentar. */
export function FiscalPanel({
  orderId,
  orderStatus,
  buyerDoc,
  canEmit,
}: {
  orderId: string;
  orderStatus: string;
  /** El DNI/CUIT que dejó el comprador: el diálogo de facturación arranca con él. */
  buyerDoc: string | null;
  canEmit: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<FiscalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const fiscalReady = useFiscalReady();

  const { loading, reload: load } = useServerLoad(
    orderId,
    () => api.get<FiscalStatus>(`/api/v1/orders/${orderId}/fiscal`),
    setData,
    () => setData(null),
  );

  const invoice = data?.documents.find((d) => !isNc(d.cbteTipo) && d.result === 'Authorized');
  // Se pidió el CAE y la respuesta no llegó: puede estar autorizado del lado de
  // ARCA. Mientras tanto no se ofrece "Facturar ahora": emitir otra vez es
  // exactamente la factura duplicada que se quiere evitar.
  const awaiting = data?.documents.find((d) => d.result === 'Pending');
  const creditNote = data?.documents.find((d) => isNc(d.cbteTipo) && d.result === 'Authorized');
  const failedJob = data?.jobs.find((j) => j.status === 'Failed');
  const activeJob = data?.jobs.find((j) => j.status === 'Pending' || j.status === 'Processing');
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

  const downloadPdf = async (kind: 'invoice' | 'creditnote') => {
    try {
      const blob = await api.download(
        `/api/v1/orders/${orderId}/invoice.pdf${kind === 'creditnote' ? '?type=creditnote' : ''}`,
      );
      // El archivo lleva el número de la venta (sin el "#"), el mismo que ve el comprador.
      downloadBlob(
        blob,
        `comprobante-${orderNumber(orderId).slice(1)}${kind === 'creditnote' ? '-nc' : ''}.pdf`,
      );
    } catch (e) {
      toast(errMsg(e, 'No se pudo descargar el comprobante.'), { variant: 'error' });
    }
  };

  const retry = async () => {
    if (!failedJob) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/fiscal/jobs/${failedJob.id}/retry`, {});
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
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          {invoice ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-success">
                {CBTE_LABEL[invoice.cbteTipo] ?? invoice.cbteTipo} {nro(invoice)} · CAE {invoice.cae}
                {invoice.caeVto ? ` (vence ${invoice.caeVto})` : ''}
              </span>
              <button
                onClick={() => downloadPdf('invoice')}
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Facturación en proceso…
            </div>
          ) : failedJob ? (
            <div className="text-danger">
              Falló la facturación automática{failedJob.lastError ? `: ${failedJob.lastError}` : ''}
            </div>
          ) : (
            <div className="text-fg-muted">Sin factura para esta orden.</div>
          )}
          {creditNote && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-info">
                {CBTE_LABEL[creditNote.cbteTipo] ?? creditNote.cbteTipo} {nro(creditNote)} · CAE{' '}
                {creditNote.cae}
              </span>
              <button
                onClick={() => downloadPdf('creditnote')}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-2xs font-medium text-fg hover:bg-bg-muted"
              >
                <Download className="h-3 w-3" /> PDF
              </button>
            </div>
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
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{' '}
              Facturar ahora
            </button>
          )}
          {canEmit && failedJob && !invoice && (
            <button
              onClick={retry}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}{' '}
              Reintentar
            </button>
          )}
        </div>
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
