import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileText, PackageCheck, Printer, ScanLine, Tag, Truck } from 'lucide-react';
import { Badge, Button, Checkbox, cn, Input, Select, Tabs, useToast, Spinner } from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { useStore } from '../context/StoreContext';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { HelpLink } from '../components/HelpLink';
import { TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import {
  base64ToBlob,
  CARRIERS,
  MAX_BATCH,
  pickListHtml,
  type CarrierId,
  type LabelBatch,
  type PickList,
  type QueueOrder,
  type QueueResponse,
} from '../lib/fulfillment';
import { ScanDispatch } from './despacho-escanear';

type Tab = 'cola' | 'escanear';

/**
 * Despacho: preparar muchos pedidos juntos. La cola de lo cobrado sin
 * despachar (por carrier y fecha), la lista de picking de los elegidos (una
 * línea por producto, en el orden del depósito), las etiquetas de los
 * carriers y los remitos en un solo PDF, y "despachar escaneando": el
 * pedido y cada producto, y recién si coincide sale despachado.
 */
export function DespachoPage() {
  const { store } = useStore();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'escanear' ? 'escanear' : 'cola';
  const setTab = (next: Tab, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    if (next === 'cola') p.delete('pedido');
    setParams(p);
  };

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-fg">Despacho</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Lo cobrado y sin despachar, para preparar de a muchos: picking, etiquetas, remitos y despachar
          escaneando.
        </p>
      </div>
      <Tabs
        items={[
          { id: 'cola', label: 'Pedidos para preparar' },
          { id: 'escanear', label: 'Despachar escaneando' },
        ]}
        value={tab}
        onChange={(t) => setTab(t)}
      />
      {tab === 'cola' ? (
        <Queue onScan={(order) => setTab('escanear', { pedido: order.id })} />
      ) : (
        <ScanDispatch initialCode={params.get('pedido')} />
      )}
      <HelpLink id="despacho" />
    </div>
  );
}

// ------------------------------------------------------------ la cola

function Queue({ onScan }: { onScan: (order: QueueOrder) => void }) {
  const { store } = useStore();
  const { toast } = useToast();
  const [carrier, setCarrier] = useState<CarrierId | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'picking' | 'labels' | 'slips' | null>(null);
  const [pickList, setPickList] = useState<PickList | null>(null);
  const [labels, setLabels] = useState<LabelBatch | null>(null);

  const query = new URLSearchParams();
  if (carrier) query.set('carrier', carrier);
  // Las fechas del filtro son días de Argentina: "hasta el 14" incluye todo el 14.
  if (from) query.set('from', `${from}T00:00:00-03:00`);
  if (to) query.set('to', `${to}T23:59:59-03:00`);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['fulfillment-queue', store?.id, carrier, from, to],
    queryFn: () => api.get<QueueResponse>(`/api/v1/fulfillment/queue?${query}`),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const orders = data?.items ?? [];
  const chosen = orders.filter((o) => selected.has(o.id)).map((o) => o.id);
  const allChosen = orders.length > 0 && chosen.length === orders.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allChosen ? new Set() : new Set(orders.slice(0, MAX_BATCH).map((o) => o.id)));

  const run = async (kind: 'picking' | 'labels' | 'slips') => {
    if (chosen.length === 0) return;
    setBusy(kind);
    try {
      if (kind === 'picking') {
        setPickList(await api.post<PickList>('/api/v1/fulfillment/pick-list', { orderIds: chosen }));
      } else if (kind === 'labels') {
        const batch = await api.post<LabelBatch>('/api/v1/fulfillment/labels', { orderIds: chosen });
        setLabels(batch);
        if (batch.pdfBase64 && batch.fileName)
          downloadBlob(base64ToBlob(batch.pdfBase64, 'application/pdf'), batch.fileName);
        toast(
          batch.ok === 0
            ? 'Ninguno de los pedidos tiene etiqueta disponible: mirá el detalle abajo.'
            : `${batch.ok} etiqueta${batch.ok === 1 ? '' : 's'} en un PDF${batch.missing ? `, ${batch.missing} sin etiqueta` : ''}.`,
          { variant: batch.ok === 0 ? 'error' : 'success' },
        );
      } else {
        const blob = await api.downloadPost('/api/v1/fulfillment/packing-slips', { orderIds: chosen });
        downloadBlob(blob, `remitos-${new Date().toISOString().slice(0, 10)}.pdf`);
      }
    } catch (err) {
      toast(errMsg(err, 'No se pudo armar. Probá de nuevo.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const printPickList = () => {
    if (!pickList) return;
    const w = window.open('', '_blank');
    if (!w) {
      toast('El navegador bloqueó la ventana de impresión: habilitá las ventanas emergentes.', {
        variant: 'error',
      });
      return;
    }
    w.document.write(pickListHtml(pickList, store?.name ?? ''));
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <Select
            aria-label="Carrier"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value as CarrierId | '')}
            options={[
              { value: '', label: `Todos los envíos (${data?.total ?? 0})` },
              ...(Object.keys(CARRIERS) as CarrierId[]).map((c) => ({
                value: c,
                label: `${CARRIERS[c]}${data?.byCarrier[c] ? ` (${data.byCarrier[c]})` : ''}`,
              })),
            ]}
          />
        </div>
        <label className="text-xs text-fg-muted">
          Cobrado desde
          <Input
            type="date"
            aria-label="Cobrado desde"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-fg-muted">
          hasta
          <Input type="date" aria-label="Cobrado hasta" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-card">
        <span className="mr-auto text-sm text-fg-muted">
          {chosen.length === 0
            ? 'Elegí pedidos para preparar juntos.'
            : `${chosen.length} pedido${chosen.length === 1 ? '' : 's'} elegido${chosen.length === 1 ? '' : 's'}`}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!chosen.length || !!busy}
          onClick={() => void run('picking')}
        >
          {busy === 'picking' ? <Spinner inline /> : <ClipboardList className="h-4 w-4" />}
          Lista de picking
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!chosen.length || !!busy}
          onClick={() => void run('labels')}
        >
          {busy === 'labels' ? <Spinner inline /> : <Tag className="h-4 w-4" />}
          Etiquetas
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!chosen.length || !!busy}
          onClick={() => void run('slips')}
        >
          {busy === 'slips' ? <Spinner inline /> : <FileText className="h-4 w-4" />}
          Remitos
        </Button>
      </div>

      {pickList && (
        <section
          aria-label="Lista de picking"
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-base font-semibold text-fg">
              Lista de picking · {pickList.orders} pedidos, {pickList.units} unidades
            </h2>
            <Button size="sm" onClick={printPickList}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPickList(null)}>
              Cerrar
            </Button>
          </div>
          {pickList.skipped.length > 0 && (
            <ul className="mb-2 space-y-0.5 text-xs text-warning">
              {pickList.skipped.map((s) => (
                <li key={s.orderId}>
                  {orders.find((o) => o.id === s.orderId)?.number ?? 'Un pedido'}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Ubicación</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                  <th className="py-2 font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {pickList.lines.map((l) => (
                  <tr key={l.variantId} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-xs">{l.location ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {l.productName}
                      {l.variantDescription && l.variantDescription !== 'Única' && (
                        <span className="text-fg-muted"> · {l.variantDescription}</span>
                      )}
                      <span className="ml-1 font-mono text-xs text-fg-subtle">{l.sku}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{l.quantity}</td>
                    <td className="py-2 text-xs text-fg-muted">
                      {l.orders.map((o) => `${o.number}×${o.quantity}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {labels && (
        <section
          aria-label="Resultado de las etiquetas"
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="mb-2 flex items-center gap-2">
            <h2 className="mr-auto text-base font-semibold text-fg">
              Etiquetas: {labels.ok} listas{labels.missing ? `, ${labels.missing} sin etiqueta` : ''}
            </h2>
            {labels.pdfBase64 && labels.fileName && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadBlob(base64ToBlob(labels.pdfBase64!, 'application/pdf'), labels.fileName!)
                }
              >
                Bajar de nuevo
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setLabels(null)}>
              Cerrar
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {labels.results.map((r) => (
              <li key={r.orderId} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{r.number}</span>
                <Badge variant={r.status === 'ok' ? 'success' : r.status === 'error' ? 'danger' : 'warning'}>
                  {r.status === 'ok' ? 'Lista' : r.status === 'error' ? 'Error' : 'Sin etiqueta'}
                </Badge>
                {r.reason && <span className="text-xs text-fg-muted">{r.reason}</span>}
                {r.status === 'sin-envio' && (
                  <Link
                    to={`/ventas?order=${r.orderId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Crear el envío
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-lg border border-border bg-surface shadow-card">
        {isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
            <Spinner inline /> Cargando pedidos…
          </p>
        ) : error && !data ? (
          <LoadError
            className="m-3"
            title="No se pudieron cargar los pedidos para preparar."
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-fg-muted">
            <PackageCheck className="h-8 w-8 opacity-50" />
            <p className="text-sm">
              No hay pedidos cobrados esperando despacho{carrier ? ' con ese envío' : ''}.
            </p>
          </div>
        ) : (
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="border-b border-border text-left text-xs text-fg-muted">
                  <th className="w-10 px-3 py-2">
                    <Checkbox aria-label="Elegir todos" checked={allChosen} onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Comprador</th>
                  <th className="px-3 py-2 font-medium">Envío</th>
                  <th className="px-3 py-2 text-right font-medium">Unid.</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className={cn(
                      'border-b border-border last:border-b-0',
                      selected.has(o.id) && 'bg-primary/5',
                    )}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        aria-label={`Elegir ${o.number}`}
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/ventas?order=${o.id}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {o.number}
                      </Link>
                      <div className="text-xs text-fg-subtle">
                        {formatDateTime(o.paidAtUtc ?? o.createdAtUtc)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-[14rem] truncate">{o.buyerName ?? o.buyerEmail}</div>
                      {o.notes && (
                        <div className="max-w-[14rem] truncate text-xs text-warning">Nota: {o.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-fg-subtle" />
                        {CARRIERS[o.carrier]}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {o.shipment
                          ? o.shipment.tracking
                            ? `Seguimiento ${o.shipment.tracking}`
                            : 'Envío creado'
                          : o.isPickup
                            ? 'Lo retira el comprador'
                            : 'Sin envío creado'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.units}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => onScan(o)}>
                        <ScanLine className="h-4 w-4" /> Escanear
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
