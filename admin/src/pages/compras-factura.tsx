import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/queryKeys';
import { FileSpreadsheet, Sparkles, Upload } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, Select, useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { formatAmount, formatDate } from '../lib/format';
import { downloadBlob } from '../lib/download';
import { parseMoneyInput } from '../lib/price';
import { useAiTask } from '../lib/useAi';
import { useStore } from '../context/StoreContext';
import { CONFIDENCE_TONE, MATCH_LABEL } from './compras-tipos';
import { UploadNotes, useFilePicker, useUploadQueue } from '../components/upload/primitives';
import { UPLOADS, describe } from '../lib/uploads';
import type { PoDetail, ScannedInvoice, ScannedInvoiceLine } from './compras-tipos';

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
        {busy ? <Spinner inline /> : <FileSpreadsheet className="h-4 w-4" />}
        Libro IVA compras
      </Button>
    </div>
  );
}

/** Pesos de un campo de importe: null si está vacío, NaN si no se entiende. */
function amountOrNull(text: string): number | null {
  return text.trim() === '' ? null : parseMoneyInput(text) / 100;
}

/**
 * La factura del proveedor: lo que el contador necesita para el libro de IVA
 * compras. Es opcional y se puede cargar después de recibir la mercadería —
 * que es cuando suele llegar el papel.
 */
export function SupplierInvoiceCard({ po }: { po: PoDetail }) {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const aiInvoice = useAiTask('InvoiceRead');
  const [taxId, setTaxId] = useState(po.supplierTaxId ?? '');
  const [type, setType] = useState(po.invoiceType ?? '');
  const [number, setNumber] = useState(po.invoiceNumber ?? '');
  const [date, setDate] = useState(po.invoiceDateUtc ? po.invoiceDateUtc.slice(0, 10) : '');
  const [net, setNet] = useState(po.invoiceNetArs != null ? String(po.invoiceNetArs) : '');
  const [vat, setVat] = useState(po.invoiceVatArs != null ? String(po.invoiceVatArs) : '');
  const [scan, setScan] = useState<ScannedInvoice | null>(null);
  // Con el lector de importes del panel: el placeholder dice "0,00" y con
  // Number() "1500,00" era NaN, que viaja como null y borraba el importe.
  const netArs = amountOrNull(net);
  const vatArs = amountOrNull(vat);
  const amountsInvalid = Number.isNaN(netArs) || Number.isNaN(vatArs);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/purchasing/purchase-orders/${po.id}/invoice`, {
        supplierTaxId: taxId.trim() || null,
        invoiceType: type.trim() || null,
        invoiceNumber: number.trim() || null,
        invoiceDateUtc: date ? new Date(`${date}T00:00:00Z`).toISOString() : null,
        invoiceNetArs: netArs,
        invoiceVatArs: vatArs,
      }),
    onSuccess: () => {
      toast('Comprobante guardado. Ya entra en el libro de IVA compras.', { variant: 'success' });
      // La misma clave que el detalle (Compras.tsx): sin la tienda no coincidía y no se refrescaba.
      queryClient.invalidateQueries({ queryKey: qk.purchaseOrder(store?.id, po.id) });
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
        {aiInvoice.visible && (
          <InvoiceScanButton
            poId={po.id}
            onScanned={setScan}
            offReason={aiInvoice.available ? null : aiInvoice.reason}
          />
        )}
      </div>

      {scan && (
        <ScanReview
          scan={scan}
          po={po}
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
        <FormField label="Neto ($)" error={Number.isNaN(netArs) ? 'No es un importe.' : undefined}>
          <Input
            value={net}
            onChange={(e) => setNet(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </FormField>
        <FormField label="IVA ($)" error={Number.isNaN(vatArs) ? 'No es un importe.' : undefined}>
          <Input
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </FormField>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || amountsInvalid}>
          {save.isPending ? <Spinner inline /> : null}
          Guardar comprobante
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------ Lectura de la factura

function InvoiceScanButton({
  poId,
  onScanned,
  offReason,
}: {
  poId: string;
  onScanned: (scan: ScannedInvoice) => void;
  /** El motivo por el que la IA no está disponible ahora (deshabilita el botón); null si anda. */
  offReason: string | null;
}) {
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
        disabled={scans.busy || offReason !== null}
        title={offReason ?? `${spec.formats} · ${spec.weight}`}
      >
        {current ? <Spinner inline /> : <Sparkles className="h-4 w-4" />}
        {!current
          ? 'Leer factura'
          : current.progress < 1
            ? `Subiendo… ${Math.round(current.progress * 100)} %`
            : 'Leyendo…'}
      </Button>
      <p className="text-right text-2xs text-fg-subtle">
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
  po,
  onApply,
  onDismiss,
}: {
  scan: ScannedInvoice;
  po: PoDetail;
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
    [
      'Otros (no gravado, exento, percepciones)',
      scan.otherAmount != null ? formatAmount(scan.otherAmount) : null,
    ],
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

      {scan.checks.length > 0 && (
        <div role="alert" className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
          <p className="font-medium">Revisá: esto no cierra</p>
          <ul className="mt-1 list-inside list-disc">
            {scan.checks.map((c) => (
              <li key={c.code}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {scan.correctionRound && (
        <p className="mt-2 text-sm text-fg-muted">
          La IA releyó la factura porque algo no cerraba. Mirá los números con más cuidado.
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
        <div className="mt-3">
          <h3 className="text-sm font-medium">
            {scan.lines.length} línea{scan.lines.length === 1 ? '' : 's'} del detalle
          </h3>
          <ul className="mt-1 divide-y divide-border">
            {scan.lines.map((line, i) => (
              <ScanLineRow key={`${line.description}-${i}`} line={line} scan={scan} po={po} />
            ))}
          </ul>
          <p className="mt-1 text-xs text-fg-subtle">
            El emparejamiento es para comparar con la orden: no cambia ítems ni costos.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs text-fg-subtle">
        Lo leyó la IA a partir del archivo. Revisá los números antes de guardar: de acá salen el libro de IVA
        compras y la deuda con el proveedor.
      </p>
    </div>
  );
}

/** Un renglón de la factura con el ítem de la orden al que se emparejó, que la persona puede cambiar. */
function ScanLineRow({ line, scan, po }: { line: ScannedInvoiceLine; scan: ScannedInvoice; po: PoDetail }) {
  const [variantId, setVariantId] = useState(line.match.variantId ?? '');
  const label = (item: PoDetail['items'][number]) =>
    `${item.productName} ${item.variantDescription} · ${item.sku}`;
  const candidates = line.match.candidates
    .map((id) => po.items.find((item) => item.variantId === id))
    .filter((item) => item !== undefined);
  const rest = po.items.filter((item) => !candidates.includes(item));
  const options = [
    { value: '', label: 'Sin emparejar' },
    ...[...candidates, ...rest].map((item) => ({ value: item.variantId, label: label(item) })),
  ];

  // Las diferencias contra la orden: para revisar, no para cambiar nada.
  const item = po.items.find((i) => i.variantId === variantId);
  const sameCurrency = scan.currency === po.currency;
  const quantityDiffers = item && line.quantity != null && line.quantity !== item.quantity;
  const priceDiffers =
    item && sameCurrency && line.unitPrice != null && Math.abs(line.unitPrice - item.unitCost) >= 0.005;

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate" title={line.description}>
          {line.description}
          {line.code && <span className="ml-1 text-xs text-fg-subtle">({line.code})</span>}
        </span>
        <span className="shrink-0 tabular-nums text-fg-muted">
          {line.quantity ?? '—'} × {line.unitPrice != null ? formatAmount(line.unitPrice) : '—'}
        </span>
        <Badge variant={CONFIDENCE_TONE[line.match.confidence] ?? 'neutral'}>
          {MATCH_LABEL[line.match.method]}
        </Badge>
      </div>
      <Select
        className="mt-1"
        aria-label={`Ítem de la orden para "${line.description}"`}
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={options}
      />
      {(quantityDiffers || priceDiffers) && item && (
        <p className="mt-1 text-xs text-warning">
          {quantityDiffers && <>Pedido: {item.quantity}</>}
          {quantityDiffers && priceDiffers && ' · '}
          {priceDiffers && <>Costo en la orden: {formatAmount(item.unitCost, po.currency)}</>}
        </p>
      )}
    </li>
  );
}

// --------------------------------------------------------- Ítems y gastos
