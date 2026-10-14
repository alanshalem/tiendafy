import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, Sparkles, Upload } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { formatAmount, formatDate } from '../lib/format';
import { downloadBlob } from '../lib/download';
import { useAiEnabled } from '../lib/useAi';
import { CONFIDENCE_TONE } from './compras-tipos';
import { UploadNotes, useFilePicker, useUploadQueue } from '../components/upload/primitives';
import { UPLOADS, describe } from '../lib/uploads';
import type { PoDetail, ScannedInvoice } from './compras-tipos';

/**
 * La factura del proveedor: leerla con IA, revisarla y descargar el libro de
 * IVA compras. Es la parte fiscal del modulo, y la unica que habla con un
 * modelo: separarla deja claro que el resto no depende de que la IA ande.
 */

export function VatBookDownload() {
  const { toast } = useToast();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const [year, month] = period.split('-').map(Number);
    if (!year || !month) return;
    setBusy(true);
    try {
      const blob = await api.download(`/api/v1/purchasing/vat-book?year=${year}&month=${month}`);
      downloadBlob(blob, `libro-iva-compras-${period}.csv`);
    } catch (err) {
      toast(errMsg(err, 'No se pudo exportar el período.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Mes del libro de IVA compras"
        type="month"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <Button variant="secondary" onClick={download} disabled={busy} title="Libro de IVA compras del mes">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Libro IVA compras
      </Button>
    </div>
  );
}

/**
 * La factura del proveedor: lo que el contador necesita para el libro de IVA
 * compras. Es opcional y se puede cargar después de recibir la mercadería —
 * que es cuando suele llegar el papel.
 */
export function SupplierInvoiceCard({ po }: { po: PoDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const aiEnabled = useAiEnabled();
  const [taxId, setTaxId] = useState(po.supplierTaxId ?? '');
  const [type, setType] = useState(po.invoiceType ?? '');
  const [number, setNumber] = useState(po.invoiceNumber ?? '');
  const [date, setDate] = useState(po.invoiceDateUtc ? po.invoiceDateUtc.slice(0, 10) : '');
  const [net, setNet] = useState(po.invoiceNetArs != null ? String(po.invoiceNetArs) : '');
  const [vat, setVat] = useState(po.invoiceVatArs != null ? String(po.invoiceVatArs) : '');
  const [scan, setScan] = useState<ScannedInvoice | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/purchasing/purchase-orders/${po.id}/invoice`, {
        supplierTaxId: taxId.trim() || null,
        invoiceType: type.trim() || null,
        invoiceNumber: number.trim() || null,
        invoiceDateUtc: date ? new Date(`${date}T00:00:00Z`).toISOString() : null,
        invoiceNetArs: net ? Number(net) : null,
        invoiceVatArs: vat ? Number(vat) : null,
      }),
    onSuccess: () => {
      toast('Comprobante guardado. Ya entra en el libro de IVA compras.', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar el comprobante.'), { variant: 'error' }),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[16rem] flex-1">
          <h2 className="text-sm font-semibold text-fg">Comprobante del proveedor</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Opcional. Con estos datos la compra entra en el libro de IVA compras que se descarga desde esta
            misma pantalla.
          </p>
        </div>
        {aiEnabled && <InvoiceScanButton poId={po.id} onScanned={setScan} />}
      </div>

      {scan && (
        <ScanReview
          scan={scan}
          onDismiss={() => setScan(null)}
          onApply={() => {
            if (scan.supplierTaxId) setTaxId(scan.supplierTaxId);
            if (scan.invoiceType) setType(scan.invoiceType);
            if (scan.invoiceNumber) setNumber(scan.invoiceNumber);
            if (scan.invoiceDateUtc) setDate(scan.invoiceDateUtc.slice(0, 10));
            if (scan.netAmount != null) setNet(String(scan.netAmount));
            if (scan.vatAmount != null) setVat(String(scan.vatAmount));
            setScan(null);
            toast('Datos cargados en el formulario. Revisalos y guardá.', { variant: 'info' });
          }}
        />
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FormField label="CUIT del proveedor">
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="30-12345678-9" />
        </FormField>
        <FormField label="Tipo">
          <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="A / B / Despacho" />
        </FormField>
        <FormField label="Número">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0001-00001234" />
        </FormField>
        <FormField label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Neto ($)">
          <Input
            value={net}
            onChange={(e) => setNet(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </FormField>
        <FormField label="IVA ($)">
          <Input
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </FormField>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar comprobante
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------ Lectura de la factura

function InvoiceScanButton({ poId, onScanned }: { poId: string; onScanned: (scan: ScannedInvoice) => void }) {
  // Lo que no sirve (otro formato, más de 10 MB) se rechaza antes de mandarlo.
  const scans = useUploadQueue('invoiceScan', (file, progress) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<ScannedInvoice>(
      `/api/v1/purchasing/purchase-orders/${poId}/invoice/scan`,
      form,
      progress,
    );
  });
  const picker = useFilePicker({
    kind: 'invoiceScan',
    disabled: scans.busy,
    onFiles: (files) => void scans.run(files.slice(0, 1), onScanned),
  });
  const spec = describe(UPLOADS.invoiceScan);
  const current = scans.pending[0];

  return (
    <div className="flex max-w-xs shrink-0 flex-col items-end gap-1.5">
      {picker.input}
      <Button
        variant="secondary"
        onClick={picker.open}
        disabled={scans.busy}
        title={`${spec.formats} · ${spec.weight}`}
      >
        {current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {!current
          ? 'Leer factura'
          : current.progress < 1
            ? `Subiendo… ${Math.round(current.progress * 100)} %`
            : 'Leyendo…'}
      </Button>
      <p className="text-right text-[11px] text-fg-subtle">
        {spec.formats} · {spec.weight}
      </p>
      <UploadNotes notes={scans.notes} onDismiss={scans.dismissNotes} showFile={false} />
    </div>
  );
}

/**
 * La propuesta antes de aceptarla. Se muestra entera —incluso lo que no pudo
 * leer— porque el valor está en revisar: un número de factura mal leído entra
 * derecho al libro de IVA y a la cuenta corriente del proveedor.
 */
function ScanReview({
  scan,
  onApply,
  onDismiss,
}: {
  scan: ScannedInvoice;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const rows: [string, string | null][] = [
    ['Proveedor', scan.supplierName],
    ['CUIT', scan.supplierTaxId],
    ['Tipo', scan.invoiceType],
    ['Número', scan.invoiceNumber],
    ['Fecha', scan.invoiceDateUtc ? formatDate(scan.invoiceDateUtc) : null],
    ['Neto', scan.netAmount != null ? formatAmount(scan.netAmount) : null],
    ['IVA', scan.vatAmount != null ? formatAmount(scan.vatAmount) : null],
    ['Total', scan.totalAmount != null ? formatAmount(scan.totalAmount) : null],
  ];
  const read = rows.filter(([, value]) => value);

  return (
    <div className="mt-3 rounded-md border border-border bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4" /> Lectura de la factura
          <Badge variant={CONFIDENCE_TONE[scan.confidence] ?? 'neutral'}>Confianza {scan.confidence}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Descartar
          </Button>
          <Button size="sm" onClick={onApply} disabled={read.length === 0}>
            Usar estos datos
          </Button>
        </div>
      </div>

      {read.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">
          No se pudo leer ningún dato del archivo. Cargalos a mano abajo.
        </p>
      ) : (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {read.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {scan.currencyMismatch && (
        <p className="mt-2 text-sm text-warning">
          La factura está en {scan.currency}. El libro de IVA va en pesos: convertí el neto y el IVA antes de
          guardar.
        </p>
      )}

      {scan.warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-fg-muted">
          {scan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {scan.lines.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-fg-muted">
            {scan.lines.length} línea{scan.lines.length === 1 ? '' : 's'} del detalle
          </summary>
          <ul className="mt-1 space-y-0.5 text-sm text-fg-muted">
            {scan.lines.map((l, i) => (
              <li key={`${l.description}-${i}`} className="flex justify-between gap-2">
                <span className="truncate">{l.description}</span>
                <span className="shrink-0 tabular-nums">
                  {l.quantity ?? '—'} × {l.unitPrice != null ? formatAmount(l.unitPrice) : '—'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-fg-subtle">
            El detalle es solo para comparar contra los ítems de la orden: los precios de compra siguen siendo
            los que cargaste arriba.
          </p>
        </details>
      )}

      <p className="mt-2 text-xs text-fg-subtle">
        Lo leyó la IA a partir del archivo. Revisá los números antes de guardar: de acá salen el libro de IVA
        compras y la deuda con el proveedor.
      </p>
    </div>
  );
}

// --------------------------------------------------------- Ítems y gastos
